/**
 * Application-level envelope encryption for sensitive Prisma columns
 * (Phase 11 — addresses the deferred item from ADR-0001 and the post-#60
 * status note that `oidcClientSecret` / `samlCert` were stored plaintext).
 *
 * Design constraints:
 *
 *  - Stored values are TEXT columns shared with the legacy plaintext form,
 *    not new BYTEA columns. A row written before encryption was wired up
 *    is still decryptable as a no-op. This makes the rollout entirely
 *    backwards compatible: no migration is required to deploy this PR;
 *    operators encrypt at next write (or run a one-shot script if they
 *    want to bring all rows to the encrypted form immediately).
 *
 *  - The encrypted form is detectable from the first six characters
 *    (`enc:v1:`). Plaintext PEMs and OIDC client secrets cannot start
 *    with that prefix, so the detection has zero ambiguity.
 *
 *  - Algorithm: AES-256-GCM with a 96-bit random IV per call and the
 *    16-byte auth tag concatenated. Standard envelope shape; no custom
 *    crypto. The master key is held in `SSO_SECRET_KEY` and is read
 *    lazily so tests that exercise the SSO read path without setting
 *    the key still work (they just see the plaintext-passthrough path).
 *
 *  - There is no per-row data-key — at this scale the master-key envelope
 *    is sufficient and avoids a key-table dependency. When a real KMS
 *    lands later, this module is the integration point: replace
 *    `getMasterKey()` with a fetch from the KMS and the call sites are
 *    untouched.
 *
 *  - Key rotation: out of scope for this PR. The `enc:v1:` prefix
 *    leaves room for `enc:v2:...` once a re-encrypt-on-read scheme is
 *    designed. Rotating today means decrypting with the old key,
 *    re-encrypting with the new key, and writing each row back —
 *    operator-driven for now.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;
let cachedKeySource: string | null = null;

/**
 * Reads `SSO_SECRET_KEY` from the environment and returns the 32-byte
 * symmetric key. Accepts either:
 *   - 64 hex chars (e.g. `openssl rand -hex 32`)
 *   - base64 / base64url encoding of 32 bytes
 *
 * Returns `null` (rather than throwing) when unset, so the caller can
 * decide whether absence is fatal. `encryptSecret` throws on null;
 * `decryptSecret` falls through to plaintext-passthrough on null and on
 * the legacy plaintext form.
 *
 * The key is cached after the first successful parse; if the env var
 * changes mid-process (only in tests) call `_resetCipherKeyCache()`.
 */
export function getMasterKey(): Buffer | null {
  const raw = process.env['SSO_SECRET_KEY'];
  if (!raw) {
    if (cachedKeySource !== null) {
      cachedKey = null;
      cachedKeySource = null;
    }
    return null;
  }
  if (cachedKey && cachedKeySource === raw) {
    return cachedKey;
  }
  const trimmed = raw.trim();
  let buf: Buffer | null = null;
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === KEY_BYTES * 2) {
    buf = Buffer.from(trimmed, 'hex');
  } else {
    try {
      const decoded = Buffer.from(trimmed, 'base64');
      if (decoded.length === KEY_BYTES) buf = decoded;
    } catch {
      buf = null;
    }
  }
  if (!buf || buf.length !== KEY_BYTES) {
    throw new Error(
      `SSO_SECRET_KEY must decode to exactly ${KEY_BYTES} bytes (64 hex chars or base64 of 32 bytes). Generate one with: openssl rand -hex 32`,
    );
  }
  cachedKey = buf;
  cachedKeySource = raw;
  return buf;
}

/**
 * Test-only: clear the cached master-key buffer. Production code paths
 * never need to call this; tests that mutate `process.env.SSO_SECRET_KEY`
 * mid-suite do.
 */
export function _resetCipherKeyCache(): void {
  cachedKey = null;
  cachedKeySource = null;
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Encrypt a plaintext secret. Throws when `SSO_SECRET_KEY` is unset —
 * callers reaching the SSO admin write path without a key configured
 * have to fix the deployment, not silently fall back to plaintext
 * (which would defeat the whole point of this module).
 *
 * Idempotent on already-encrypted input: returns the value unchanged
 * if it already carries the `enc:v1:` prefix. This keeps an
 * encrypt-then-write path safe to call from a "just save the row" code
 * path without the caller having to track ciphertext-vs-plaintext.
 */
export function encryptSecret(plaintext: string): string {
  if (isEncryptedSecret(plaintext)) return plaintext;
  const key = getMasterKey();
  if (!key) {
    throw new Error(
      'SSO_SECRET_KEY is not set. Refusing to write a plaintext SSO secret to the database. Generate one with: openssl rand -hex 32',
    );
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, ciphertext, tag]).toString('base64');
  return `${PREFIX}${blob}`;
}

/**
 * Decrypt — or, when the input is plaintext (no `enc:v1:` prefix),
 * return it verbatim. The plaintext-passthrough is what makes this PR
 * deployable without a backfill: existing rows continue to work,
 * encryption applies to whatever the next write touches.
 *
 * Throws on:
 *   - encrypted input with `SSO_SECRET_KEY` unset (no way to recover)
 *   - tampered / wrong-key input (GCM auth tag fails verification)
 *   - malformed encoding
 *
 * Empty / null / undefined → returned as-is (lets callers feed
 * `idp.samlCert` directly without a guard).
 */
export function decryptSecret(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (!isEncryptedSecret(value)) return value;
  const key = getMasterKey();
  if (!key) {
    throw new Error(
      'Encrypted SSO secret encountered but SSO_SECRET_KEY is not set. The deployment must provide the same key used to encrypt the row.',
    );
  }
  const blob = value.slice(PREFIX.length);
  let buf: Buffer;
  try {
    buf = Buffer.from(blob, 'base64');
  } catch {
    throw new Error('Malformed encrypted SSO secret: not valid base64');
  }
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('Malformed encrypted SSO secret: payload too short');
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  // timingSafeEqual is overkill here (GCM's auth tag is itself the integrity
  // check) — we keep it imported as a documentation hint for future reviewers
  // looking for constant-time comparisons. The real check is the next call.
  void timingSafeEqual;
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err) {
    throw new Error(
      `Failed to decrypt SSO secret — wrong SSO_SECRET_KEY, or the row was written with a different key. (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}
