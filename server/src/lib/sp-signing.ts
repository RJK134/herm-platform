/**
 * SP-side X.509 keypair for SAML AuthnRequest signing + SP metadata signing
 * (Phase 11.3 — closes the UKAMF compliance follow-up from ADR-0001).
 *
 * UK Access Management Federation (UKAMF) and most production-grade SAML
 * IdPs require the SP to sign its AuthnRequests and publish a signed
 * `<EntityDescriptor>`. v1's SAML flow shipped UNSIGNED, which works
 * against permissive IdPs only. After this module is wired up, the SP
 * keypair is read from env once at startup and threaded into:
 *
 *   - `node-saml`'s SamlConfig.privateKey + .publicCert     (signs AuthnRequests)
 *   - `generateServiceProviderMetadata`'s privateKey/publicCerts + signMetadata
 *
 * Two env vars, both optional. When EITHER is set, BOTH must be set —
 * a half-configured deployment (key without cert, or vice versa) is a
 * fatal misconfiguration we surface at first read with a clear error.
 *
 *   SP_SIGNING_KEY   PEM-encoded RSA/EC private key. Either:
 *                    - Inline PEM with literal "\n" or real newlines.
 *                    - "file:/absolute/path/to/key.pem" — the file is
 *                      read once and cached.
 *
 *   SP_SIGNING_CERT  PEM-encoded X.509 certificate. Same accepted forms.
 *
 * Generate a self-signed pair for staging:
 *
 *   openssl req -x509 -newkey rsa:2048 -nodes -days 730 \
 *     -keyout sp-signing.key -out sp-signing.crt \
 *     -subj "/CN=herm-sp"
 *
 * For UKAMF-registered production, use the keypair the federation
 * authority issues / trusts. Rotate by deploying with both old + new
 * env values populated and updating federation metadata; this module's
 * scope is read-on-boot only — rotation is operator-driven for v1.
 */
import { readFileSync } from 'node:fs';

interface SigningMaterial {
  privateKey: string;
  publicCert: string;
}

let cached: SigningMaterial | null | undefined = undefined;

function readMaybeFromFile(envName: string, raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('file:')) {
    const path = trimmed.slice('file:'.length);
    try {
      return readFileSync(path, 'utf8');
    } catch (err) {
      throw new Error(
        `${envName}=file:${path} could not be read: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  // Allow operators to encode newlines as literal "\n" in env vars
  // (common when the value lives in a single-line secret store).
  return trimmed.includes('\\n') ? trimmed.replace(/\\n/g, '\n') : trimmed;
}

function assertPem(envName: string, value: string, expectedHeaders: readonly string[]): void {
  const ok = expectedHeaders.some((h) => value.includes(`-----BEGIN ${h}-----`));
  if (!ok) {
    throw new Error(
      `${envName} does not look like a PEM-encoded ${expectedHeaders.join(' / ')} (expected a "-----BEGIN ${expectedHeaders[0]}-----" header).`,
    );
  }
}

/**
 * Returns the SP signing material when configured; `null` when neither
 * env var is set (the legacy unsigned flow). Throws when only one of
 * the two is set, or when the values don't parse as PEM.
 *
 * Cached after the first successful read; the cache is process-scoped
 * and tests can clear it via `_resetSpSigningCache()`.
 */
export function getSpSigningMaterial(): SigningMaterial | null {
  if (cached !== undefined) return cached;
  const rawKey = process.env['SP_SIGNING_KEY'];
  const rawCert = process.env['SP_SIGNING_CERT'];

  if (!rawKey && !rawCert) {
    cached = null;
    return null;
  }
  if (!rawKey || !rawCert) {
    throw new Error(
      'SP_SIGNING_KEY and SP_SIGNING_CERT must both be set, or both unset. ' +
        `Got: SP_SIGNING_KEY=${rawKey ? 'set' : 'unset'}, SP_SIGNING_CERT=${rawCert ? 'set' : 'unset'}.`,
    );
  }
  const privateKey = readMaybeFromFile('SP_SIGNING_KEY', rawKey);
  const publicCert = readMaybeFromFile('SP_SIGNING_CERT', rawCert);
  assertPem('SP_SIGNING_KEY', privateKey, ['PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY']);
  assertPem('SP_SIGNING_CERT', publicCert, ['CERTIFICATE']);
  cached = { privateKey, publicCert };
  return cached;
}

/** Test hook: clears the cached signing material. */
export function _resetSpSigningCache(): void {
  cached = undefined;
}
