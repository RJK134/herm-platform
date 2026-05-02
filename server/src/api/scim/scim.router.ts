/**
 * SCIM 2.0 router (Phase 11.11). RFC 7644 + RFC 7643 Users-only.
 *
 * Mount path: `/scim/v2/*` (NOT under `/api/*`). SCIM clients send
 * verbatim paths and the `application/scim+json` media type; namespacing
 * under `/api` would force every IdP integration to special-case HERM.
 *
 * Auth: `scimApiKeyAuth` mirrors `middleware/api-key-auth.ts` but emits
 * SCIM RFC 7644 §3.12 error envelopes on failure (the shared
 * `apiKeyAuth` returns the HERM `{success, error}` envelope, which
 * would break SCIM clients). `requireScimPermission` then enforces the
 * `admin:scim` permission on the resolved key.
 *
 * Errors thrown by handlers are caught by `scimErrorHandler` and
 * converted to SCIM-shaped responses, so a 500 from a Prisma hiccup
 * doesn't leak the HERM error envelope to a SCIM client.
 */
import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import { Router } from 'express';
import prisma from '../../utils/prisma';
import { logger } from '../../lib/logger';
import { sendScimError } from './scim.errors';
import {
  listUsers,
  getUser,
  createUser,
  replaceUser,
  deleteUser,
  patchUserNotImplemented,
} from './scim.users.controller';
import { serviceProviderConfig, resourceTypes, schemas } from './scim.config.controller';

const SCIM_PERMISSION = 'admin:scim';
const API_KEY_PREFIX = 'herm_pk_';

// ── Negative-cache (FIFO) for SCIM bearer auth ─────────────────────────────
//
// Phase 11.15 hardening (M1). Each invalid bearer would otherwise hit
// Postgres on every probe — combined with the fact that the SCIM mount
// is now also rate-limited per IP (M2), an attacker probing keys still
// burns one DB round-trip per attempt. The cache short-circuits a hash
// that recently failed.
//
// Bounded by SCIM_NEGATIVE_CACHE_MAX entries with a 30s TTL. Eviction
// is FIFO via Map insertion order — Map preserves insertion order in
// JS, so on a `set` that exceeds capacity we delete the oldest key.
// FIFO is sufficient here: the workload is "lots of probes for one
// hash quickly, then move on", so recency-of-access doesn't help much
// over insertion-time. Keeps the implementation small (no LRU lib).
//
// Only NEGATIVE results are cached. A positive (accepted) lookup goes
// through to Prisma every time so a key revocation or expiry takes
// effect immediately on the next request. Caching positive results
// would keep a revoked key alive for up to TTL, which is unacceptable.
//
// Phase 11.16 — negative results now include EVERY rejection case (no
// row, inactive, expired, tenant soft-deleted), not just the "no row"
// probe path. Caching only "no row" earlier opened a multi-request
// timing oracle: an attacker could distinguish "invalid hash" (cache
// hit on second probe → fast) from "valid hash, rejected" (cache miss
// every time → DB round-trip). Admin-driven flips that move a hash
// from rejected → accepted now take effect at the next request AFTER
// the 30s cache TTL elapses; that tradeoff is intentional.
const SCIM_NEGATIVE_CACHE_MAX = 256;
const SCIM_NEGATIVE_CACHE_TTL_MS = 30_000;

interface NegativeCacheEntry {
  cachedAt: number;
}

const scimNegativeCache = new Map<string, NegativeCacheEntry>();

function negativeCacheGet(keyHash: string): boolean {
  const hit = scimNegativeCache.get(keyHash);
  if (!hit) return false;
  if (Date.now() - hit.cachedAt >= SCIM_NEGATIVE_CACHE_TTL_MS) {
    scimNegativeCache.delete(keyHash);
    return false;
  }
  return true;
}

function negativeCacheSet(keyHash: string): void {
  // FIFO eviction once we exceed capacity. Map iterates in insertion
  // order, so the first key from `keys()` is the oldest.
  if (scimNegativeCache.size >= SCIM_NEGATIVE_CACHE_MAX) {
    const oldest = scimNegativeCache.keys().next().value;
    if (oldest !== undefined) scimNegativeCache.delete(oldest);
  }
  scimNegativeCache.set(keyHash, { cachedAt: Date.now() });
}

/** Test hook: clears the SCIM negative auth cache. */
export function _resetScimNegativeCacheForTests(): void {
  scimNegativeCache.clear();
}

/** Test hook: read current cache size. */
export function _scimNegativeCacheSizeForTests(): number {
  return scimNegativeCache.size;
}

/**
 * SCIM-specific API key auth.
 *
 * Mirrors `middleware/api-key-auth.ts` behaviour but emits SCIM error
 * envelopes on failure. The shared middleware returns the HERM error
 * shape, which would break SCIM clients that parse responses by
 * `schemas: [...Error]`. Auth-success sets `req.apiUser` with the same
 * shape so the controllers do not need to distinguish.
 *
 * Phase 11.15 hardening:
 *   - All boolean checks (active / expired / institution-soft-deleted)
 *     are evaluated as a single combined boolean before branching, so
 *     a timing side-channel can't distinguish "valid hash, inactive
 *     key" from "valid hash, expired key" from "valid hash, tenant
 *     soft-deleted" from "invalid hash, no row". The DB round-trip
 *     dominates timing; this just removes the in-process JS branches
 *     that would otherwise let an attacker discriminate post-lookup.
 *   - A small negative cache short-circuits a hash that recently
 *     failed, so an unauth probe storm doesn't hammer Postgres.
 *   - The `Institution.deletedAt` check fixes H3: SCIM provisioning
 *     into a tombstoned tenant during the retention grace window is
 *     refused with the same opaque "invalid token" envelope so an
 *     outside probe can't tell that the institution still has rows.
 */
async function scimApiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token || !token.startsWith(API_KEY_PREFIX)) {
    sendScimError(res, { status: 401, detail: 'API key required' });
    return;
  }
  try {
    const keyHash = crypto.createHash('sha256').update(token).digest('hex');

    // Negative cache short-circuit. Phase 11.16 — every rejection case
    // (no row / inactive / expired / tenant-deleted) is cached for
    // SCIM_NEGATIVE_CACHE_TTL_MS so a multi-request timing oracle
    // can't distinguish "invalid hash" from "valid hash but rejected".
    // Admin-driven flips (revoke → restore, expiry extension, tenant
    // un-delete) take effect at the next request AFTER the cache TTL
    // elapses; the alternative is leaking which hashes hit a row.
    if (negativeCacheGet(keyHash)) {
      sendScimError(res, { status: 401, detail: 'API key required' });
      return;
    }

    // Single Prisma round-trip joining the parent institution so we
    // can apply the H3 tenant-deletion gate without a second query.
    // Selecting only the columns we need keeps the row narrow.
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      select: {
        id: true,
        institutionId: true,
        permissions: true,
        isActive: true,
        expiresAt: true,
        institution: { select: { deletedAt: true } },
      },
    });

    // Constant-time-ish acceptance. Build a single boolean and only
    // branch once at the bottom — no early returns between the
    // sub-checks. This still has a DB-vs-no-DB timing gap (mitigated
    // by the negative cache + the rate limiter), but it removes the
    // post-lookup JS branches that earlier let "valid hash, inactive
    // key" be distinguished from "valid hash, expired key".
    const now = Date.now();
    const hasRow = apiKey !== null && apiKey !== undefined;
    const isActive = hasRow && apiKey.isActive === true;
    const notExpired = hasRow && (apiKey.expiresAt === null || apiKey.expiresAt.getTime() >= now);
    const tenantLive =
      hasRow &&
      (apiKey.institution?.deletedAt === null || apiKey.institution?.deletedAt === undefined);
    const accepted = hasRow && isActive && notExpired && tenantLive;

    if (!accepted) {
      // Phase 11.16 — cache EVERY rejection, not just "no row". Caching
      // only the no-row branch left a timing oracle: an inactive /
      // expired / tenant-deleted hash hit Prisma on every probe while
      // a non-existent hash hit the cache after the first probe, so
      // the second-probe latency distinguished the two classes. Trade
      // a 30s window for revoke/restore/expiry-extension visibility
      // for closure of that oracle.
      negativeCacheSet(keyHash);
      sendScimError(res, { status: 401, detail: 'API key required' });
      return;
    }

    req.apiUser = {
      id: apiKey.id,
      institutionId: apiKey.institutionId,
      permissions: apiKey.permissions,
      tier: 'enterprise',
    };
    // Telemetry only — out of the request critical path.
    void prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    next();
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'scim api-key auth lookup failed',
    );
    sendScimError(res, { status: 401, detail: 'API key required' });
  }
}

function requireScimPermission(req: Request, res: Response, next: NextFunction): void {
  if (!req.apiUser) {
    sendScimError(res, { status: 401, detail: 'API key required' });
    return;
  }
  if (!req.apiUser.permissions.includes(SCIM_PERMISSION)) {
    sendScimError(res, {
      status: 403,
      detail: `API key missing required permission: ${SCIM_PERMISSION}`,
    });
    return;
  }
  next();
}

/**
 * SCIM-shaped error middleware. Wrapped controllers that throw or call
 * `next(err)` would otherwise bubble to the app-level error handler,
 * which emits the HERM error envelope and breaks SCIM clients. This
 * middleware catches everything inside the SCIM mount and reformats.
 *
 * Express recognises this as an error handler via the 4-arg signature.
 */
function scimErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    'scim handler unhandled error',
  );
  sendScimError(res, {
    status: 500,
    detail: 'Internal server error',
  });
}

export function createScimRouter(): Router {
  const router = Router();

  router.use(scimApiKeyAuth);
  router.use(requireScimPermission);

  // Service-discovery endpoints
  router.get('/ServiceProviderConfig', serviceProviderConfig);
  router.get('/ResourceTypes', resourceTypes);
  router.get('/Schemas', schemas);

  // Users resource
  router.get('/Users', listUsers);
  router.get('/Users/:id', getUser);
  router.post('/Users', createUser);
  router.put('/Users/:id', replaceUser);
  router.patch('/Users/:id', patchUserNotImplemented);
  router.delete('/Users/:id', deleteUser);

  // Anything else under /scim/v2 — unsupported resource. Return a SCIM
  // 404 instead of falling through to the generic 404 handler.
  router.use((_req, res) => {
    sendScimError(res, { status: 404, detail: 'Unknown SCIM resource' });
  });

  // SCIM-shaped error envelope for anything thrown by handlers.
  router.use(scimErrorHandler);

  return router;
}
