/**
 * UKAMF cert auto-rotation (Phase 11.10) — closes the deferred follow-up
 * from ADR-0001 Q2: "IdP cert rotation. Operator-driven for v1. UKAMF
 * publishes a federation metadata feed; auto-rotation by polling that
 * feed is a follow-up."
 *
 * What this does
 *   Periodically fetches the UK Access Management Federation (UKAMF)
 *   metadata feed (or any SAML 2.0 metadata aggregate) and, for each
 *   `SsoIdentityProvider` row whose `samlEntityId` appears in the feed,
 *   compares the feed's signing certificate to the stored cert. When
 *   they differ, the row is updated with the new cert (re-encrypted at
 *   rest via `secret-cipher`) and an `auth.sso.cert_rotated` audit row
 *   is written.
 *
 *   Rows whose entityID is NOT in the feed are silently skipped — the
 *   operator may run an IdP outside UKAMF, and that's fine.
 *
 * Why a separate scheduler from retention
 *   Different cadence (cert rotations are rare; retention runs frequently),
 *   different failure mode (network call vs. DB query), different opt-in
 *   surface for operators. Sharing the scheduler infrastructure would
 *   couple unrelated concerns.
 *
 * Configuration
 *   UKAMF_METADATA_URL          required to enable. URL of the metadata
 *                               aggregate. UKAMF production feed is
 *                               https://metadata.ukfederation.org.uk/
 *                               ukfederation-metadata.xml. The scheduler
 *                               is a no-op if unset.
 *   UKAMF_ROTATION_ENABLED      default `false`. Explicit opt-in so dev
 *                               envs do not surprise-write rows. When
 *                               `true` (and the URL is set), the in-process
 *                               timer starts at server boot.
 *   UKAMF_ROTATION_INTERVAL_MS  default 24 * 60 * 60 * 1000 (24 h). Cert
 *                               rotations in UKAMF are rare; a daily
 *                               sweep is plenty.
 *   UKAMF_FETCH_TIMEOUT_MS      default 30_000 (30 s). The UKAMF feed is
 *                               megabytes; allow generous timeout.
 *
 * Manual operation
 *   `npx tsx server/src/scripts/ukamf-rotate.ts [--dry-run]` runs one
 *   sweep and exits — useful for ad-hoc cleanup or for an out-of-process
 *   cron that prefers to drive the sweep externally.
 *
 * Single-pod assumption
 *   The scheduler is process-local. In a multi-pod deployment every pod
 *   would tick its own sweep; the work is idempotent (a row whose cert
 *   already matches the feed is a no-op) but the redundant fetches are
 *   wasteful. A future hardening pass can guard with Redis SETNX-based
 *   leader election; v1 ships without it.
 */
import { DOMParser } from '@xmldom/xmldom';
import * as xpath from 'xpath';
import { createHash } from 'node:crypto';
import prisma from '../../utils/prisma';
import { logger } from '../../lib/logger';
import { audit } from '../../lib/audit';
import { encryptSecret, decryptSecret } from '../../lib/secret-cipher';

export interface RotationStats {
  scanned: number;
  rotated: number;
  skipped: number;
  errors: number;
}

export interface RotationOptions {
  /** Override the env-provided feed URL. */
  feedUrl?: string;
  /** When true, only counts and logs; performs no DB writes. */
  dryRun?: boolean;
  /** Override the fetch timeout. */
  fetchTimeoutMs?: number;
}

interface FeedEntry {
  entityId: string;
  signingCertPem: string;
}

const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Strip PEM headers + all whitespace so two cosmetically-different
 * representations of the same cert hash to the same value. Necessary
 * because the XML <ds:X509Certificate> body is bare base64, while the
 * stored cert is wrapped PEM.
 */
function normalizeCert(input: string): string {
  return input.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
}

/**
 * Wrap raw base64 from the XML in PEM headers with 64-char line breaks
 * so node-saml accepts the stored cert without further processing.
 */
function toPem(base64: string): string {
  const cleaned = base64.replace(/\s+/g, '');
  const wrapped = cleaned.match(/.{1,64}/g)?.join('\n') ?? cleaned;
  return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----\n`;
}

/**
 * Parse a SAML 2.0 metadata aggregate and return a map of
 * entityID → signing cert (PEM). Entities without an IDPSSODescriptor or
 * without a usable signing key are skipped silently.
 *
 * Accepts both `<KeyDescriptor use="signing">` and `<KeyDescriptor>`
 * without a `use` attribute (which the spec treats as serving both
 * signing and encryption). Encryption-only descriptors are ignored.
 */
export function parseMetadataFeed(xml: string): Map<string, FeedEntry> {
  const doc = new DOMParser({
    errorHandler: {
      // The UKAMF feed validates against its schema upstream; locally we
      // suppress non-fatal warnings to keep logs quiet.
      warning: () => undefined,
      error: () => undefined,
      fatalError: (msg: string) => {
        throw new Error(`metadata XML parse error: ${msg}`);
      },
    },
  }).parseFromString(xml, 'application/xml');

  // xmldom's parser is lenient — it returns a (mostly empty) document for
  // garbage input rather than throwing. Validate the root element so we
  // surface a clear error before xpath silently returns []. The two
  // accepted roots are `<EntitiesDescriptor>` (an aggregate, the UKAMF
  // shape) and `<EntityDescriptor>` (a single-entity document, what most
  // standalone IdPs publish).
  const root = (doc as unknown as { documentElement: Element | null }).documentElement;
  const rootName = root?.localName ?? '';
  if (rootName !== 'EntitiesDescriptor' && rootName !== 'EntityDescriptor') {
    throw new Error(
      `metadata XML root must be <EntitiesDescriptor> or <EntityDescriptor>; got <${rootName || 'unknown'}>`,
    );
  }

  const select = xpath.useNamespaces({
    md: 'urn:oasis:names:tc:SAML:2.0:metadata',
    ds: 'http://www.w3.org/2000/09/xmldsig#',
  });

  const entityNodes = select('//md:EntityDescriptor', doc as unknown as Node) as Node[];
  const result = new Map<string, FeedEntry>();

  for (const ent of entityNodes) {
    const entityId = (ent as Element).getAttribute('entityID');
    if (!entityId) continue;
    const signingCertNodes = select(
      './md:IDPSSODescriptor/md:KeyDescriptor[@use="signing" or not(@use)]/ds:KeyInfo/ds:X509Data/ds:X509Certificate',
      ent,
    ) as Node[];
    if (signingCertNodes.length === 0) continue;
    const certText = (signingCertNodes[0] as Element).textContent?.trim() ?? '';
    if (!certText) continue;
    result.set(entityId, { entityId, signingCertPem: toPem(certText) });
  }
  return result;
}

/**
 * GET the metadata feed. Times out after `timeoutMs` to avoid wedging
 * the scheduler on a stalled network read.
 */
export async function fetchMetadataFeed(url: string, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) {
      throw new Error(`UKAMF feed returned HTTP ${resp.status}`);
    }
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run one rotation sweep. Resolves with stats regardless of outcome —
 * fetch / parse failures are logged and counted, never thrown.
 */
export async function rotateOnce(options: RotationOptions = {}): Promise<RotationStats> {
  const url = options.feedUrl ?? process.env['UKAMF_METADATA_URL'];
  const stats: RotationStats = { scanned: 0, rotated: 0, skipped: 0, errors: 0 };

  if (!url) {
    logger.debug('ukamf.rotate: UKAMF_METADATA_URL not set; skipping');
    return stats;
  }

  const timeoutMs = options.fetchTimeoutMs ?? readNumberEnv('UKAMF_FETCH_TIMEOUT_MS', DEFAULT_FETCH_TIMEOUT_MS);

  let xml: string;
  try {
    xml = await fetchMetadataFeed(url, timeoutMs);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), url },
      'ukamf.fetch.failed',
    );
    stats.errors++;
    return stats;
  }

  let feed: Map<string, FeedEntry>;
  try {
    feed = parseMetadataFeed(xml);
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'ukamf.parse.failed');
    stats.errors++;
    return stats;
  }

  const idps = await prisma.ssoIdentityProvider.findMany({
    where: { protocol: 'SAML', samlEntityId: { not: null } },
  });

  for (const idp of idps) {
    stats.scanned++;
    const entityId = idp.samlEntityId;
    if (!entityId) {
      stats.skipped++;
      continue;
    }
    const feedEntry = feed.get(entityId);
    if (!feedEntry) {
      stats.skipped++;
      continue;
    }

    let currentPlain: string;
    try {
      currentPlain = decryptSecret(idp.samlCert) ?? '';
    } catch (err) {
      // Decryption failure is logged but does NOT block rotation; we
      // proceed to overwrite with the new cert from the trusted feed.
      logger.warn(
        {
          idpId: idp.id,
          err: err instanceof Error ? err.message : String(err),
        },
        'ukamf.rotate.decrypt-failed-overwriting',
      );
      currentPlain = '';
    }

    if (normalizeCert(currentPlain) === normalizeCert(feedEntry.signingCertPem)) {
      stats.skipped++;
      continue;
    }

    const oldSha = currentPlain ? sha256Hex(normalizeCert(currentPlain)) : 'none';
    const newSha = sha256Hex(normalizeCert(feedEntry.signingCertPem));

    if (options.dryRun) {
      stats.rotated++;
      logger.info({ idpId: idp.id, entityId, oldSha, newSha }, 'ukamf.rotate.dry-run');
      continue;
    }

    try {
      await prisma.ssoIdentityProvider.update({
        where: { id: idp.id },
        data: { samlCert: encryptSecret(feedEntry.signingCertPem) },
      });
      await audit(undefined, {
        action: 'auth.sso.cert_rotated',
        entityType: 'SsoIdentityProvider',
        entityId: idp.id,
        userId: null,
        changes: {
          institutionId: idp.institutionId,
          samlEntityId: entityId,
          oldCertSha256: oldSha,
          newCertSha256: newSha,
        },
      });
      stats.rotated++;
      logger.info(
        { idpId: idp.id, entityId, oldSha, newSha },
        'ukamf.rotate.applied',
      );
    } catch (err) {
      stats.errors++;
      logger.error(
        {
          idpId: idp.id,
          entityId,
          err: err instanceof Error ? err.message : String(err),
        },
        'ukamf.rotate.failed',
      );
    }
  }

  logger.info(stats, 'ukamf.rotate.summary');
  return stats;
}

let intervalHandle: NodeJS.Timeout | null = null;

export function isUkamfRotationEnabled(): boolean {
  if (process.env['UKAMF_ROTATION_ENABLED'] !== 'true') return false;
  if (!process.env['UKAMF_METADATA_URL']) return false;
  if (!process.env['SSO_SECRET_KEY']) {
    logger.error(
      'ukamf.scheduler: SSO_SECRET_KEY is not set; cert encryption would fail — rotation disabled',
    );
    return false;
  }
  return true;
}

/**
 * Start the in-process timer. Idempotent — calling twice is a no-op.
 * Designed to be invoked once from `index.ts` after the HTTP listener
 * binds, so the scheduler never blocks startup.
 */
export function startUkamfRotationScheduler(): void {
  if (intervalHandle) return;
  if (!isUkamfRotationEnabled()) {
    logger.info(
      'ukamf.scheduler: not enabled (set UKAMF_ROTATION_ENABLED=true and UKAMF_METADATA_URL to opt in)',
    );
    return;
  }
  const intervalMs = readNumberEnv('UKAMF_ROTATION_INTERVAL_MS', DEFAULT_INTERVAL_MS);

  setImmediate(() => {
    rotateOnce().catch((err: unknown) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'ukamf.rotate.failed',
      );
    });
  });
  intervalHandle = setInterval(() => {
    rotateOnce().catch((err: unknown) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'ukamf.rotate.failed',
      );
    });
  }, intervalMs);
  intervalHandle.unref?.();

  logger.info({ intervalMs }, 'ukamf.scheduler: started');
}

export function stopUkamfRotationScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
