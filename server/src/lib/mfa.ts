/**
 * TOTP (RFC 6238) MFA primitives — Phase 10.8.
 *
 * Wraps `otplib` with sensible defaults so the rest of the server doesn't
 * have to know about TOTP windowing, base32 encoding, or otpauth URI
 * formatting. The defaults match Google / Microsoft / Authy / 1Password —
 * 30-second period, 6 digits, ±1 window of clock skew tolerance (i.e. a
 * code is accepted in the immediately-preceding or following 30s slot).
 *
 * Storage / encryption:
 *   The shared secret is persisted on the User row as base32 text. Writing
 *   the column in plaintext is intentional for v1 — application-level
 *   envelope encryption is a follow-up. The contract with operators is
 *   that DB at-rest encryption (Postgres TDE / managed-DB equivalent) is
 *   in place. Auditing this assumption is on the deployment runbook,
 *   not on this module.
 *
 * Issuer + label:
 *   The otpauth URI carries an `issuer` string that authenticator apps
 *   render alongside the account label. We pin this to the product brand
 *   so the user knows which platform a code is for. The label is the
 *   user's email, which is unique and self-describing.
 *
 * Challenge tokens:
 *   When a user with `mfaEnabledAt != null` completes the password step,
 *   we mint a SHORT-LIVED (5 min) challenge token instead of a session
 *   JWT. The challenge token carries `purpose: 'mfa_challenge'`, which
 *   `authenticateJWT` rejects so a challenge can never be used as a
 *   session token. The matching verify-and-mint endpoint validates the
 *   challenge, runs `verifyTotp`, and only then issues a normal JWT.
 */
import { authenticator } from 'otplib';
import jwt from 'jsonwebtoken';
import { PRODUCT } from './branding';

// otplib defaults are the de-facto standard but pin them explicitly so a
// future otplib upgrade can't silently change behaviour for existing users.
authenticator.options = { window: 1, step: 30, digits: 6 };

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret';
const CHALLENGE_TTL_SECONDS = 5 * 60;
const CHALLENGE_PURPOSE = 'mfa_challenge' as const;

/** Base32-encoded shared secret. Authenticator apps consume this. */
export function generateMfaSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Build the otpauth:// URI used for QR-code / manual entry into an
 * authenticator app. Format: otpauth://totp/<issuer>:<label>?secret=...&issuer=...
 */
export function buildOtpauthUri(secret: string, email: string): string {
  return authenticator.keyuri(email, PRODUCT.name, secret);
}

/**
 * Validate a TOTP code against a stored secret. Constant-time comparison
 * inside otplib. A `window: 1` tolerance means a code from the previous
 * or next 30s slot still verifies — this absorbs ~30s of client/server
 * clock skew without lowering the bar so far that an attacker has time
 * to brute-force.
 */
export function verifyTotp(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code.trim())) return false;
  try {
    return authenticator.verify({ token: code.trim(), secret });
  } catch {
    return false;
  }
}

export interface MfaChallengePayload {
  purpose: typeof CHALLENGE_PURPOSE;
  userId: string;
}

/**
 * Mint a short-lived challenge token after a successful password step.
 * The token is purpose-tagged so `authenticateJWT` rejects it for normal
 * session use; only `POST /api/auth/mfa/login` accepts it.
 */
export function generateMfaChallengeToken(userId: string): string {
  const payload: MfaChallengePayload = { purpose: CHALLENGE_PURPOSE, userId };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: CHALLENGE_TTL_SECONDS });
}

/**
 * Verify a challenge token. Returns the user id on success, null on any
 * failure (expired, wrong signature, wrong purpose). Callers MUST treat
 * a null return as a 401-equivalent.
 */
export function verifyMfaChallengeToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Partial<MfaChallengePayload>;
    if (decoded.purpose !== CHALLENGE_PURPOSE) return null;
    if (typeof decoded.userId !== 'string' || !decoded.userId) return null;
    return decoded.userId;
  } catch {
    return null;
  }
}

export const MFA_CHALLENGE_PURPOSE = CHALLENGE_PURPOSE;
export const MFA_CHALLENGE_TTL_SECONDS = CHALLENGE_TTL_SECONDS;
