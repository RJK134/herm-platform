/**
 * One-shot encryption migration for legacy plaintext SSO secrets.
 *
 * Closes the deferred follow-up from PR #63: "scripts/encrypt-existing-sso-secrets
 * to bring already-deployed legacy plaintext rows to the encrypted form."
 *
 * Background
 *   PR #63 introduced AES-256-GCM envelope encryption for the
 *   `SsoIdentityProvider.samlCert` and `.oidcClientSecret` columns. The
 *   rollout was deliberately backwards compatible: existing plaintext
 *   rows still resolve through `decryptSecret`'s plaintext-passthrough
 *   branch, and rows are encrypted on the next write. That leaves a
 *   long tail of plaintext rows for deployments that never touch the
 *   admin write path. This script closes that gap.
 *
 * What it does
 *   1. Reads every `SsoIdentityProvider` row.
 *   2. For each plaintext (non-`enc:v1:`) `samlCert` or `oidcClientSecret`,
 *      encrypts it with the configured master key.
 *   3. Writes the row back. Already-encrypted values are skipped (the
 *      script is idempotent and safe to re-run).
 *   4. Reports counts: rows scanned, rows touched, secrets encrypted.
 *
 * Safety
 *   - Refuses to run without `SSO_SECRET_KEY`. There is no graceful
 *     fallback because the only correct outcome is encrypted-at-rest.
 *   - Wraps each row in a single `prisma.update` so a partial run can
 *     be re-attempted without leaving a half-encrypted column behind
 *     (the prefix detection makes re-runs no-ops on encrypted rows).
 *   - `--dry-run` lists the rows that would change without writing.
 *
 * Usage
 *   SSO_SECRET_KEY=$(cat /etc/herm/sso.key) \
 *     npx tsx server/src/scripts/encrypt-sso-secrets.ts [--dry-run]
 *
 *   Or via the `npm run db:encrypt-sso` alias which wraps the same
 *   command for parity with the other DB lifecycle scripts.
 */
import { PrismaClient } from '@prisma/client';
import { createCipheriv, randomBytes } from 'node:crypto';

// Local copies of the cipher constants — duplicated rather than imported
// from server/src/lib/secret-cipher.ts so this script stands alone (it's
// run from the repo root with `npx tsx`, which would otherwise need a
// path-mapping fix-up to resolve the server/ package). The format MUST
// match secret-cipher.ts exactly: `enc:v1:<base64(iv|ciphertext|tag)>`.
const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

function loadMasterKey(): Buffer {
  const raw = process.env['SSO_SECRET_KEY'];
  if (!raw) {
    throw new Error(
      'SSO_SECRET_KEY is not set. This script requires the same key the running server uses to decrypt rows on read. Generate one with: openssl rand -hex 32',
    );
  }
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === KEY_BYTES * 2) {
    return Buffer.from(trimmed, 'hex');
  }
  const decoded = Buffer.from(trimmed, 'base64');
  if (decoded.length === KEY_BYTES) return decoded;
  throw new Error(
    `SSO_SECRET_KEY must decode to ${KEY_BYTES} bytes (64 hex chars or base64 of 32 bytes).`,
  );
}

function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encryptOne(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, ciphertext, tag]).toString('base64')}`;
}

interface RunStats {
  scanned: number;
  touched: number;
  samlCertsEncrypted: number;
  oidcSecretsEncrypted: number;
  alreadyEncrypted: number;
  empty: number;
}

async function run({ dryRun }: { dryRun: boolean }): Promise<RunStats> {
  const key = loadMasterKey();
  const prisma = new PrismaClient();
  const stats: RunStats = {
    scanned: 0,
    touched: 0,
    samlCertsEncrypted: 0,
    oidcSecretsEncrypted: 0,
    alreadyEncrypted: 0,
    empty: 0,
  };

  try {
    const rows = await prisma.ssoIdentityProvider.findMany({
      select: { id: true, institutionId: true, protocol: true, samlCert: true, oidcClientSecret: true },
    });
    stats.scanned = rows.length;

    for (const row of rows) {
      const update: { samlCert?: string; oidcClientSecret?: string } = {};

      if (row.samlCert) {
        if (isEncrypted(row.samlCert)) {
          stats.alreadyEncrypted += 1;
        } else {
          update.samlCert = encryptOne(row.samlCert, key);
          stats.samlCertsEncrypted += 1;
        }
      } else {
        stats.empty += 1;
      }

      if (row.oidcClientSecret) {
        if (isEncrypted(row.oidcClientSecret)) {
          stats.alreadyEncrypted += 1;
        } else {
          update.oidcClientSecret = encryptOne(row.oidcClientSecret, key);
          stats.oidcSecretsEncrypted += 1;
        }
      } else {
        stats.empty += 1;
      }

      if (Object.keys(update).length > 0) {
        stats.touched += 1;
        if (!dryRun) {
          await prisma.ssoIdentityProvider.update({ where: { id: row.id }, data: update });
        }
        // eslint-disable-next-line no-console
        console.log(
          `  ${dryRun ? '[dry-run]' : '[write]   '} ${row.protocol}  institution=${row.institutionId}  ${
            update.samlCert ? 'samlCert ' : ''
          }${update.oidcClientSecret ? 'oidcClientSecret' : ''}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  return stats;
}

function parseArgs(argv: readonly string[]): { dryRun: boolean } {
  return { dryRun: argv.includes('--dry-run') };
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs(process.argv.slice(2));
  // eslint-disable-next-line no-console
  console.log(
    `\nencrypt-sso-secrets — ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}\n` +
      `scanning SsoIdentityProvider rows for plaintext samlCert / oidcClientSecret …\n`,
  );
  const stats = await run({ dryRun });
  // eslint-disable-next-line no-console
  console.log(
    `\nDone.\n` +
      `  rows scanned             ${stats.scanned}\n` +
      `  rows ${dryRun ? 'would be ' : ''}touched         ${stats.touched}\n` +
      `  samlCert encrypted       ${stats.samlCertsEncrypted}\n` +
      `  oidcClientSecret encrypted  ${stats.oidcSecretsEncrypted}\n` +
      `  already encrypted (skipped) ${stats.alreadyEncrypted}\n` +
      `  empty / null columns        ${stats.empty}\n`,
  );
}

// Skip auto-run when imported by the unit test (which exercises `run`
// directly with a mocked Prisma client). The server tsconfig targets
// CommonJS, so `require.main === module` is the appropriate guard;
// switching to `import.meta` would need a tsconfig module bump.
declare const require: { main?: unknown } | undefined;
declare const module: unknown;
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

export { run, isEncrypted, encryptOne, loadMasterKey };
