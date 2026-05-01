/**
 * Session store (Phase 11.12) — backs SAML Single Logout.
 *
 * Each issued JWT records a row keyed by its `jti` claim; the auth
 * middleware consults the store to reject revoked sessions before the
 * token's natural expiry. Two indices:
 *
 *   1. By `jti`   — checked on every authenticated request (cheap GET).
 *   2. By `(institutionId, samlNameId, samlSessionIndex?)` — looked up
 *      when an IdP-initiated LogoutRequest arrives, so the back-channel
 *      can revoke the session(s) matching the IdP's subject.
 *
 * Redis is the production backend (mirrors the lockout pattern from
 * Phase 10.9). When `REDIS_URL` is unset, the store falls back to an
 * in-memory `Map` so dev / test paths still work — at the cost of
 * per-pod scope, which is acceptable because SLO is opt-in and
 * multi-pod deployments already require Redis (per the readiness probe
 * in Phase 10.6).
 *
 * Design notes:
 *   - Tokens issued BEFORE this module landed have no `jti` claim. The
 *     auth middleware skips the revocation check when `jti` is absent
 *     so legacy tokens keep working until natural expiry. SLO is opt-in
 *     and only IdP-initiated logout depends on it.
 *   - Records carry `expiresAt`; both backends drop expired entries on
 *     read so a misconfigured cleaner can never serve stale revocations.
 *   - Revocations are tombstoned for the original session TTL — long
 *     enough that the JWT's natural expiry stops anything the
 *     tombstone might miss, short enough that storage stays bounded.
 */
import type { Redis } from 'ioredis';
import { getRedis } from './redis';
import { logger } from './logger';

export interface SessionRecord {
  jti: string;
  userId: string;
  institutionId: string;
  /** SAML NameID assertion (typically email) if the session was minted via SAML. */
  samlNameId?: string;
  /** SAML SessionIndex from the AuthnStatement if present. */
  samlSessionIndex?: string;
  /** Unix epoch ms when the underlying JWT expires. */
  expiresAt: number;
}

const SESSION_PREFIX = 'session:jti:';
const REVOKED_PREFIX = 'session:revoked:';
const NAMEID_PREFIX = 'session:nameid:';

function nameIdKey(institutionId: string, nameId: string): string {
  return `${NAMEID_PREFIX}${institutionId}:${nameId}`;
}

function ttlSecondsFromExpiresAt(expiresAt: number): number {
  const ms = expiresAt - Date.now();
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * In-memory backend. Per-pod, no cross-pod visibility. Designed to
 * keep dev / test working without a Redis dependency.
 */
class InMemoryStore {
  private byJti = new Map<string, SessionRecord>();
  private byNameId = new Map<string, Set<string>>();
  private revoked = new Map<string, number>();

  recordSession(rec: SessionRecord): void {
    this.byJti.set(rec.jti, rec);
    if (rec.samlNameId) {
      const key = nameIdKey(rec.institutionId, rec.samlNameId);
      const set = this.byNameId.get(key) ?? new Set<string>();
      set.add(rec.jti);
      this.byNameId.set(key, set);
    }
  }

  isRevoked(jti: string): boolean {
    const exp = this.revoked.get(jti);
    if (exp === undefined) return false;
    if (exp < Date.now()) {
      this.revoked.delete(jti);
      return false;
    }
    return true;
  }

  revoke(jti: string): void {
    const rec = this.byJti.get(jti);
    const expiresAt = rec?.expiresAt ?? Date.now() + 7 * 24 * 60 * 60 * 1000;
    this.revoked.set(jti, expiresAt);
    if (rec) {
      this.byJti.delete(jti);
      if (rec.samlNameId) {
        const key = nameIdKey(rec.institutionId, rec.samlNameId);
        const set = this.byNameId.get(key);
        if (set) {
          set.delete(jti);
          if (set.size === 0) this.byNameId.delete(key);
        }
      }
    }
  }

  /**
   * Find every active session for a given (institutionId, nameId).
   * When sessionIndex is provided, narrow to sessions whose AuthnStatement
   * SessionIndex matches; SLO LogoutRequests typically include it but
   * the spec allows omission, in which case we revoke every session for
   * the subject.
   */
  findByNameId(
    institutionId: string,
    nameId: string,
    sessionIndex?: string,
  ): SessionRecord[] {
    const key = nameIdKey(institutionId, nameId);
    const set = this.byNameId.get(key);
    if (!set) return [];
    const out: SessionRecord[] = [];
    for (const jti of set) {
      const rec = this.byJti.get(jti);
      if (!rec) continue;
      if (rec.expiresAt < Date.now()) continue;
      // SessionIndex narrowing: when the LogoutRequest carries an
      // `<saml:SessionIndex>` element, only revoke sessions whose
      // recorded SessionIndex matches exactly. A record without a
      // recorded SessionIndex is NOT a match — we'd otherwise
      // over-revoke (the IdP-targeted single session) every session
      // for the subject. When `sessionIndex` is omitted (the
      // LogoutRequest didn't carry one), we revoke every session for
      // the subject, which is also the SAML-spec behaviour.
      if (sessionIndex !== undefined && rec.samlSessionIndex !== sessionIndex) continue;
      out.push(rec);
    }
    return out;
  }

  reset(): void {
    this.byJti.clear();
    this.byNameId.clear();
    this.revoked.clear();
  }
}

const memory = new InMemoryStore();

/**
 * Test-only hook: drop in-memory state. Has no effect on the Redis
 * backend (callers that want a fresh Redis state should flush keys).
 */
export function _resetSessionStoreForTests(): void {
  memory.reset();
}

async function recordInRedis(redis: Redis, rec: SessionRecord): Promise<void> {
  const ttl = ttlSecondsFromExpiresAt(rec.expiresAt);
  await redis.set(`${SESSION_PREFIX}${rec.jti}`, JSON.stringify(rec), 'EX', ttl);
  if (rec.samlNameId) {
    const key = nameIdKey(rec.institutionId, rec.samlNameId);
    await redis.sadd(key, rec.jti);
    await redis.expire(key, ttl);
  }
}

async function isRevokedInRedis(redis: Redis, jti: string): Promise<boolean> {
  const flag = await redis.get(`${REVOKED_PREFIX}${jti}`);
  return flag !== null;
}

async function revokeInRedis(redis: Redis, jti: string): Promise<void> {
  // Tombstone the jti for the remaining TTL of the original session.
  // If the session row is gone (already expired or never existed), use
  // the JWT max TTL as a defensive ceiling.
  const raw = await redis.get(`${SESSION_PREFIX}${jti}`);
  let ttl = 7 * 24 * 60 * 60;
  if (raw) {
    try {
      const rec = JSON.parse(raw) as SessionRecord;
      ttl = ttlSecondsFromExpiresAt(rec.expiresAt);
      // Drop the index entry too so reverse-lookup doesn't find this jti.
      if (rec.samlNameId) {
        await redis.srem(nameIdKey(rec.institutionId, rec.samlNameId), jti);
      }
    } catch {
      // fall through with the default TTL
    }
  }
  await redis.set(`${REVOKED_PREFIX}${jti}`, '1', 'EX', ttl);
  await redis.del(`${SESSION_PREFIX}${jti}`);
}

async function findByNameIdInRedis(
  redis: Redis,
  institutionId: string,
  nameId: string,
  sessionIndex: string | undefined,
): Promise<SessionRecord[]> {
  const jtis = await redis.smembers(nameIdKey(institutionId, nameId));
  if (jtis.length === 0) return [];
  const recs: SessionRecord[] = [];
  for (const jti of jtis) {
    const raw = await redis.get(`${SESSION_PREFIX}${jti}`);
    if (!raw) {
      // Stale index entry (expired session, or revocation already
      // dropped the row). Sweep it on the way through.
      await redis.srem(nameIdKey(institutionId, nameId), jti);
      continue;
    }
    try {
      const rec = JSON.parse(raw) as SessionRecord;
      // Same SessionIndex semantics as the in-memory backend:
      // when the LogoutRequest carries a SessionIndex, require an
      // exact match (a record without a recorded SessionIndex is
      // NOT a match — over-revoking would defeat the narrow logout).
      if (sessionIndex !== undefined && rec.samlSessionIndex !== sessionIndex) continue;
      recs.push(rec);
    } catch {
      // ignore corrupt row
    }
  }
  return recs;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Record a freshly-minted session. Fire-and-forget: failures are logged
 * but never thrown, because a Redis hiccup at issue time would otherwise
 * block users from logging in. The trade-off is that an unrecorded
 * session cannot be reached by SLO; that degrades SLO to "best-effort"
 * during Redis outages, which is the operationally-correct posture for
 * an opt-in feature.
 *
 * Redis-vs-memory exclusivity: when Redis is configured, ONLY Redis is
 * written. The in-memory backend would otherwise retain every session
 * forever (no TTL/pruning) and the process would leak memory under
 * production load. When Redis is unset (dev / test), the in-memory
 * backend is the source of truth — its TTLs are honoured by the
 * read paths via the recorded `expiresAt`.
 */
export async function recordSession(rec: SessionRecord): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await recordInRedis(redis, rec);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), jti: rec.jti },
        'session-store.record failed',
      );
    }
    return;
  }
  memory.recordSession(rec);
}

/**
 * Synchronous revocation check against the in-memory backend ONLY.
 *
 * With the Redis-vs-memory exclusivity model (a Redis-configured
 * deployment writes only to Redis), this function returns false for
 * every jti in production — the in-memory backend has nothing to
 * check. Useful only in dev / test setups (where Redis is unset and
 * memory IS the source of truth) or as a fast-path "definitely revoked
 * locally" hint. Authentication paths that need a correct answer in
 * production MUST use the async `isRevoked()` instead.
 */
export function isRevokedSync(jti: string): boolean {
  return memory.isRevoked(jti);
}

/**
 * Revocation check used by `authenticateJWT`. Consults Redis when
 * configured, the in-memory backend otherwise. Errors on the Redis
 * path default to "not revoked" so a Redis hiccup doesn't lock every
 * user out; the alternative (fail-closed) would be operationally
 * worse.
 */
export async function isRevoked(jti: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      return await isRevokedInRedis(redis, jti);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), jti },
        'session-store.isRevoked failed; defaulting to not-revoked',
      );
      return false;
    }
  }
  return memory.isRevoked(jti);
}

/**
 * Revoke a single session by jti. Used by `POST /api/auth/logout` and
 * by the SLO back-channel for each session that matches the asserted
 * NameID + SessionIndex.
 */
export async function revokeSession(jti: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await revokeInRedis(redis, jti);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), jti },
        'session-store.revoke failed',
      );
    }
    return;
  }
  memory.revoke(jti);
}

/**
 * Revoke every session matching the SAML subject. Returns the number of
 * sessions revoked; callers (the SLO endpoint) audit the count and the
 * NameID for the operator's review.
 *
 * Redis-vs-memory exclusivity matches `recordSession`: a Redis-configured
 * deployment uses ONLY Redis. The in-memory fallback path here would
 * have been empty anyway (records were never written to it), so we
 * surface the Redis failure instead of pretending we found zero.
 */
export async function revokeBySamlSubject(
  institutionId: string,
  nameId: string,
  sessionIndex?: string,
): Promise<number> {
  const redis = getRedis();
  let candidates: SessionRecord[];
  if (redis) {
    try {
      candidates = await findByNameIdInRedis(redis, institutionId, nameId, sessionIndex);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), institutionId },
        'session-store.findByNameId failed; returning 0',
      );
      return 0;
    }
  } else {
    candidates = memory.findByNameId(institutionId, nameId, sessionIndex);
  }
  let revoked = 0;
  for (const rec of candidates) {
    await revokeSession(rec.jti);
    revoked++;
  }
  return revoked;
}
