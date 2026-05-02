/**
 * Replay cache for SAML LogoutRequest IDs (Phase 11.15 — H2).
 *
 * `validateInResponseTo: ValidateInResponseTo.never` means node-saml
 * verifies the redirect-binding signature on a LogoutRequest but does
 * NOT track which request IDs have already been consumed. An attacker
 * who passively captures one signed SLO redirect could replay it
 * indefinitely until the IdP signing cert rotates, revoking the
 * victim's sessions on each replay. Bounded to logout (no
 * impersonation), but a stable nuisance vector.
 *
 * This cache records `sso:slo:replay:{institutionId}:{requestId}` with
 * a TTL bounded by the LogoutRequest's NotOnOrAfter when present, or a
 * default 300s window otherwise. Inserts use Redis `SET ... EX NX` so
 * a duplicate write returns null and the caller can reject. Mirror of
 * the `flow-store.ts` shape: Redis primary, in-memory Map fallback
 * when `REDIS_URL` is unset.
 *
 * Per-pod fallback note: a multi-pod attacker would need to hit the
 * same pod that processed the original request to replay through the
 * Map. Acceptable for single-pod deployments and dev. Operators MUST
 * set REDIS_URL for multi-pod deployments — same posture as the OIDC
 * flow store.
 */
import type { Redis } from 'ioredis';
import { getRedis } from '../../lib/redis';
import { logger } from '../../lib/logger';

const KEY_PREFIX = 'sso:slo:replay';

/**
 * Default TTL (seconds) when the LogoutRequest carries no NotOnOrAfter
 * attribute. 300s comfortably exceeds the inbound IdP-redirect window
 * for any well-behaved IdP and bounds the in-memory Map's growth.
 */
export const DEFAULT_REPLAY_TTL_SECONDS = 300;

const memStore = new Map<string, { expiresAt: number }>();

function cacheKey(institutionId: string, requestId: string): string {
  return `${KEY_PREFIX}:${institutionId}:${requestId}`;
}

function memPrune(now: number): void {
  for (const [k, v] of memStore) {
    if (v.expiresAt <= now) memStore.delete(k);
  }
}

/**
 * Compute the cache TTL in seconds from an optional NotOnOrAfter ISO
 * timestamp. Returns max(1, secondsUntilExpiry) when the attribute is
 * present and parses; falls back to `DEFAULT_REPLAY_TTL_SECONDS`
 * otherwise. The floor of 1s prevents a `SET ... EX 0` (which Redis
 * rejects) when the LogoutRequest has already expired by the time we
 * reach the cache write — we still want the replay record so an
 * immediate retry within the same request handler is rejected.
 */
export function computeReplayTtlSeconds(
  notOnOrAfter: string | undefined,
  now: number = Date.now(),
): number {
  if (!notOnOrAfter) return DEFAULT_REPLAY_TTL_SECONDS;
  const expiry = Date.parse(notOnOrAfter);
  if (!Number.isFinite(expiry)) return DEFAULT_REPLAY_TTL_SECONDS;
  const seconds = Math.ceil((expiry - now) / 1000);
  return Math.max(1, seconds);
}

async function recordRedis(client: Redis, key: string, ttlSeconds: number): Promise<boolean> {
  // SET k 1 EX <ttl> NX — returns 'OK' on first write, null on duplicate.
  // Atomic claim: a duplicate replay attempt cannot win the race.
  const result = await client.set(key, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

function recordMem(key: string, ttlSeconds: number, now: number): boolean {
  memPrune(now);
  if (memStore.has(key)) return false;
  memStore.set(key, { expiresAt: now + ttlSeconds * 1000 });
  return true;
}

/**
 * Atomically claim a `(institutionId, requestId)` pair for the given
 * TTL. Returns `true` when this is the first time the pair has been
 * seen (the caller proceeds), `false` when it's already been recorded
 * (the caller treats the request as a replay and emits the same
 * generic SLO failure response).
 *
 * Redis errors fall back to the in-memory Map so a transient Redis
 * blip doesn't lock out legitimate logout traffic — same posture as
 * `lib/lockout`.
 */
export async function recordSloRequest(
  institutionId: string,
  requestId: string,
  ttlSeconds: number,
): Promise<boolean> {
  const key = cacheKey(institutionId, requestId);
  const now = Date.now();
  const client = getRedis();
  if (client) {
    try {
      return await recordRedis(client, key, ttlSeconds);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'sso slo-replay-cache: redis record failed, falling back to in-memory',
      );
    }
  }
  return recordMem(key, ttlSeconds, now);
}

/** Test hook: drop the in-memory cache. */
export function __resetSloReplayCacheForTests(): void {
  memStore.clear();
}
