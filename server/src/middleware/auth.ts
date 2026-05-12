import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { VendorJwtPayload } from '../api/vendor-portal/vendor-portal.service';
import prisma from '../utils/prisma';
import { isRevoked, recordSession } from '../lib/session-store';
import { LEGACY_TIER_ALIASES, normaliseTier } from '../lib/branding';
import { logger } from '../lib/logger';

/**
 * Phase 15.2 JWT alias shim. The `professional` tier was renamed to
 * `pro` in Postgres + branding constants; tokens minted before the
 * rebrand still carry `tier: 'professional'`. Rewrite the claim
 * in-place so downstream middleware (`requirePaidTier(['pro'])`, the
 * client's `RequireTier`) admits the bearer transparently. Log once
 * per rewrite at info level so we can watch the legacy traffic decline
 * and remove the shim when it stops firing (see RUNBOOK § "Tier-alias
 * deprecation").
 */
function aliasLegacyTierClaim(decoded: JwtPayload): void {
  const original = decoded.tier;
  if (!original) return;
  const lower = original.toLowerCase();
  if (LEGACY_TIER_ALIASES[lower] !== undefined) {
    decoded.tier = normaliseTier(original);
    logger.info(
      {
        event: 'auth.jwt.tier.aliased',
        userId: decoded.userId,
        legacy: lower,
        resolved: decoded.tier,
      },
      'Rewrote legacy tier claim on JWT',
    );
  }
}

if (!process.env['JWT_SECRET']) {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  } else {
    console.warn('[AUTH] WARNING: JWT_SECRET not set — using insecure dev-secret. Set JWT_SECRET in .env');
  }
}

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret';

/**
 * The shape of a JWT in this platform. When `impersonator` is set, the
 * token represents an active customer-support impersonation session
 * (Phase 10.3): every middleware that checks `req.user.role` continues
 * to use the TARGET user's role (so the support engineer sees the
 * platform exactly as the customer would), but `audit()` and the auth
 * banner read `req.user.impersonator` to record who actually performed
 * the action and to keep the support engineer aware they are not
 * acting as themselves.
 */
export interface ImpersonatorClaim {
  userId: string;
  email: string;
  name: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  institutionId: string;
  institutionName: string;
  tier: string;
  /** Set when the bearer is impersonating; absent on normal sessions. */
  impersonator?: ImpersonatorClaim;
  /**
   * Phase 11.12 — JWT id, populated by `generateToken`. Tokens minted
   * before this phase have no `jti`; the revocation check in
   * `authenticateJWT` skips when the claim is absent so legacy tokens
   * keep working until natural expiry.
   */
  jti?: string;
}

/**
 * Optional SAML attributes carried alongside `JwtPayload` when a session
 * is minted via SAML SSO. Not embedded in the JWT itself — they live on
 * the session store row keyed by `jti`, so the back-channel SLO endpoint
 * can find every session matching a given (institutionId, NameID).
 */
export interface SsoSessionAttributes {
  samlNameId?: string;
  samlSessionIndex?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
      vendorUser?: VendorJwtPayload;
      frameworkId?: string;
    }
  }
}

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

/**
 * Phase 11.9 — soft-delete revocation cache.
 *
 * Every authenticated request consults `User.deletedAt` so that a
 * GDPR erasure (or any future admin-driven soft-delete) takes effect
 * even before the user's outstanding JWT expires. Without a cache that
 * would be a Prisma round-trip per request; with one, we amortise to
 * roughly one round-trip per user per `SOFT_DELETE_CACHE_TTL_MS`. The
 * window is short enough to bound the worst-case post-erasure activity
 * window, long enough that the steady-state cost is negligible.
 *
 * The cache is process-local; multi-pod deployments will independently
 * each cache for ~30 s after a soft-delete. If shorter convergence
 * matters operationally, drop `SOFT_DELETE_CACHE_TTL_MS` to 0 — the
 * tradeoff is one read per request.
 *
 * Phase 11.16 (M5) — bounded by `MAX_CACHE_SIZE` entries with FIFO
 * eviction + opportunistic prune of expired entries on every set. The
 * earlier unbounded `Map` could grow without limit on a long-lived
 * node: every distinct authenticated userId left a residue, and the
 * lazy TTL check inside `isUserSoftDeleted` only fires on lookup of
 * the same key — so a user who authenticates once, then never again
 * until their JWT naturally expires (or rotates), leaves an orphan
 * entry forever. FIFO over LRU because the workload is "one entry per
 * active user" — recency-of-access doesn't help much over insertion-
 * time, and FIFO skips the per-hit delete-and-reinsert overhead on
 * the hot path.
 *
 * `MAX_CACHE_SIZE` is exported for tests that need to drive the cap.
 */
const SOFT_DELETE_CACHE_TTL_MS = 30_000;
export const MAX_CACHE_SIZE = 4096;
const softDeleteCache = new Map<string, { deleted: boolean; cachedAt: number }>();

/**
 * Walk the cache and drop entries older than TTL. Cheap (size is
 * bounded by MAX_CACHE_SIZE) and runs only on the miss-set path so the
 * hot read path stays branch-light. Without this, an entry whose user
 * never re-authenticates after the original write would survive
 * indefinitely on a long-running node.
 */
function pruneExpired(now: number): void {
  for (const [k, v] of softDeleteCache) {
    if (now - v.cachedAt >= SOFT_DELETE_CACHE_TTL_MS) softDeleteCache.delete(k);
  }
}

async function isUserSoftDeleted(userId: string): Promise<boolean> {
  // Test-mode opt-out: the existing test suite mocks `prisma.user`
  // with `.mockResolvedValueOnce` patterns that would be consumed by
  // this lookup before the test's own controller ever reaches Prisma.
  // Tests that specifically want to exercise the revocation path opt
  // back in by setting ENABLE_SOFT_DELETE_AUTH_CHECK=true.
  if (
    process.env['NODE_ENV'] === 'test' &&
    process.env['ENABLE_SOFT_DELETE_AUTH_CHECK'] !== 'true'
  ) {
    return false;
  }
  const now = Date.now();
  const hit = softDeleteCache.get(userId);
  if (hit && now - hit.cachedAt < SOFT_DELETE_CACHE_TTL_MS) {
    return hit.deleted;
  }
  // Phase 11.14 — also check Institution.deletedAt. Tenant soft-delete
  // may be applied separately from the per-User scrub, so this rejects
  // an otherwise-live user as soon as the linked institution row is
  // marked soft-deleted. The cascade in `services/retention/cascade.ts`
  // stamps `Institution.deletedAt` BEFORE the per-User scrub so this
  // gate engages first; if a later cascade step errors, JWT auth is
  // already blocked. (This guarantee depends on the cascade ordering;
  // the gate itself only checks the row's current `deletedAt`.)
  // Loaded in the same round-trip as the per-User check via the nested
  // `select` on the institution relation.
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletedAt: true, institution: { select: { deletedAt: true } } },
  });
  // The check answers "is this user in the soft-delete grace window?"
  //   - row found with deletedAt non-null  → soft-deleted, reject.
  //   - row found with institution.deletedAt non-null → tenant gone, reject.
  //   - row found with deletedAt null      → live user, allow.
  //   - row not found (already hard-deleted, or row never existed) →
  //     allow. This matches the pre-Phase-11.9 baseline where the JWT
  //     is self-contained and a hard-deleted user's outstanding token
  //     remains valid until expiry; the row's absence has already
  //     stripped the user from every per-tenant query, so the token
  //     can no longer reach data. Forcing the missing-row path to 401
  //     would break every test that constructs a JWT without seeding
  //     a User row, with no commensurate security gain.
  //
  // The `!= null` (loose equality) is deliberate: it treats both
  // `null` (no soft-delete recorded) and `undefined` (some test
  // mocks omit the field entirely) as "live", which keeps the
  // existing test surface intact.
  const userDeleted = !!(row && row.deletedAt != null);
  // Phase 11.14 — same loose-equality treatment for institution.deletedAt
  // so test mocks that omit the institution sub-object don't trip the
  // gate. The `?.` chain handles `row.institution` being undefined
  // (which `findUnique` may return when the relation isn't included
  // by some narrower mock setup).
  const tenantDeleted = !!(row && row.institution && row.institution.deletedAt != null);
  const deleted = userDeleted || tenantDeleted;
  // Active prune + FIFO eviction before the new write so memory stays
  // bounded under any access pattern. Map iterates in insertion order,
  // so the first key from `keys()` is the oldest. Delete before set to
  // ensure an existing key is reinserted at the end on refresh.
  pruneExpired(now);
  while (softDeleteCache.size >= MAX_CACHE_SIZE) {
    const oldest = softDeleteCache.keys().next().value;
    if (oldest === undefined) break;
    softDeleteCache.delete(oldest);
  }
  if (softDeleteCache.has(userId)) {
    softDeleteCache.delete(userId);
  }
  softDeleteCache.set(userId, { deleted, cachedAt: now });
  return deleted;
}

/** Test hook: clears the soft-delete revocation cache. */
export function _resetSoftDeleteCacheForTests(): void {
  softDeleteCache.clear();
}

/** Test hook: read current cache size for assertions. */
export function _softDeleteCacheSizeForTests(): number {
  return softDeleteCache.size;
}

export async function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({
      success: false,
      error: { code: 'AUTHENTICATION_ERROR', message: 'Authentication token required' },
    });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { purpose?: string };
    // Phase 10.8: short-lived purpose-tagged tokens (e.g. the MFA challenge
    // token minted between password and TOTP) MUST NOT pass session auth.
    // Only the matching purpose-aware endpoint accepts them.
    if (decoded.purpose) {
      res.status(401).json({
        success: false,
        error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid or expired token' },
      });
      return;
    }
    // Phase 11.12 — SAML SLO revocation. Run BEFORE the soft-delete
    // lookup so a revoked / stolen token short-circuits without
    // touching Postgres. Tokens minted before this phase have no
    // `jti` claim; we skip the check for them so legacy bearers keep
    // working until natural expiry. New tokens always carry a jti and
    // so can be revoked back-channel by the IdP.
    if (decoded.jti && (await isRevoked(decoded.jti))) {
      res.status(401).json({
        success: false,
        error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid or expired token' },
      });
      return;
    }
    // Phase 11.9 — revoke the session as soon as the User row is
    // soft-deleted (GDPR erasure or admin removal). The check is
    // cached for SOFT_DELETE_CACHE_TTL_MS to keep the per-request
    // cost amortised. Tests can opt out by mocking
    // `_resetSoftDeleteCacheForTests` — the cache returns `false`
    // for any user not in the cache, then a single missed lookup
    // populates it.
    if (await isUserSoftDeleted(decoded.userId)) {
      res.status(401).json({
        success: false,
        error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid or expired token' },
      });
      return;
    }
    aliasLegacyTierClaim(decoded);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid or expired token' },
    });
  }
}

export async function optionalJWT(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { purpose?: string };
      // Phase 10.8 follow-up: purpose-tagged tokens (MFA challenge,
      // future flows) carry a `purpose` claim and lack the session
      // fields (role / institutionId / tier / etc). authenticateJWT
      // already rejects them; optionalJWT must do the same. Otherwise
      // the app-level optionalJWT in app.ts decodes them and sets
      // req.user to a partial object whose downstream consumers
      // (rate-limiter key, tierGate, frameworkContext) operate on
      // undefined — a real defence-in-depth gap.
      if (decoded.purpose) {
        next();
        return;
      }
      // Phase 11.12 follow-up: SAML SLO revocation must apply to
      // `optionalJWT` too. This middleware runs at the app level on
      // every /api request, so a revoked JWT would otherwise still
      // populate req.user for downstream middleware (apiRateLimiter,
      // tierGate, frameworkContext, requireRole guard chains that
      // start with optionalJWT). After IdP-initiated SLO revokes a
      // jti, the bearer must appear anonymous on every path, not just
      // the ones guarded by `authenticateJWT`. Tokens minted before
      // Phase 11.12 have no `jti` claim — they keep working until
      // natural expiry, mirroring the authenticateJWT behaviour.
      if (decoded.jti && (await isRevoked(decoded.jti))) {
        next();
        return;
      }
      aliasLegacyTierClaim(decoded);
      req.user = decoded;
    } catch {
      // proceed as anonymous
    }
  }
  next();
}

export const optionalAuth = optionalJWT;

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'AUTHENTICATION_ERROR', message: 'Authentication required' },
      });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'AUTHORIZATION_ERROR',
          message: `Role '${req.user.role}' cannot perform this action`,
        },
      });
      return;
    }
    next();
  };
}

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Mint a JWT and record the session in the store so SAML SLO can
 * revoke it. Optional `sso` attributes carry the SAML NameID +
 * SessionIndex; when present, the session row is indexed by them so
 * an IdP-initiated LogoutRequest can find every session for that
 * subject.
 *
 * Session-store writes are best-effort — failures are logged but
 * never thrown so a Redis hiccup at issue time can't block login.
 */
export function generateToken(payload: JwtPayload, sso?: SsoSessionAttributes): string {
  const jti = randomUUID();
  const token = jwt.sign({ ...payload, jti }, JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS });
  // Fire-and-forget; recordSession swallows its own errors.
  void recordSession({
    jti,
    userId: payload.userId,
    institutionId: payload.institutionId,
    ...(sso?.samlNameId ? { samlNameId: sso.samlNameId } : {}),
    ...(sso?.samlSessionIndex ? { samlSessionIndex: sso.samlSessionIndex } : {}),
    expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000,
  });
  return token;
}

/**
 * Issue a short-lived impersonation token. The payload IS the target
 * user's payload (so role/tier/institution flow naturally through every
 * middleware), with an `impersonator` claim added so the audit pipeline
 * and the client banner know who really sent the request.
 *
 * The 1-hour expiry is deliberate — long enough for a support engineer
 * to reproduce a customer issue in a single session, short enough that
 * a forgotten or copy-pasted token can't sit in a terminal history
 * indefinitely.
 */
export function generateImpersonationToken(
  targetPayload: Omit<JwtPayload, 'impersonator'>,
  impersonator: ImpersonatorClaim,
): string {
  const payload: JwtPayload = { ...targetPayload, impersonator };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}
