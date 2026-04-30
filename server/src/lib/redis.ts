/**
 * Redis client wrapper (Phase 10.6).
 *
 * Lazy singleton built from `REDIS_URL`. When the env var is unset,
 * `getRedis()` returns null and callers treat Redis as "not present" —
 * the platform doesn't yet depend on Redis for any user-facing flow,
 * so this is acceptable. Future workstreams (P10.5 session store, the
 * Phase 9 rate-limiter Redis backend) can read this same singleton.
 *
 * Connection behaviour:
 *   - `lazyConnect: true` — the constructor doesn't open a TCP socket;
 *     ioredis only connects on the first command. This means the
 *     readiness probe is the first connection attempt, which keeps
 *     boot order independent of Redis availability.
 *   - `maxRetriesPerRequest: 1` — keeps the readiness probe's window
 *     bounded. The 1s timeout in the probe is the real ceiling.
 *   - Errors emitted on the connection are swallowed (logged at debug)
 *     so a disconnect doesn't crash the process. The probe surfaces
 *     the actual state.
 */
import IORedis, { type Redis } from 'ioredis';
import { logger } from './logger';

let singleton: Redis | null = null;
let configuredUrl: string | undefined;

export function getRedis(): Redis | null {
  const url = process.env['REDIS_URL'];
  if (!url) {
    if (singleton) {
      // Env was unset between calls — drop the cached client so a later
      // re-set picks up the new config. Realistic only in tests.
      singleton.disconnect();
      singleton = null;
      configuredUrl = undefined;
    }
    return null;
  }

  if (singleton && configuredUrl === url) return singleton;

  if (singleton) {
    singleton.disconnect();
  }

  try {
    singleton = new IORedis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    configuredUrl = url;
    singleton.on('error', (err) => {
      // Swallow — the readiness probe is the source of truth for
      // "is Redis up". Logging at debug avoids noise on transient
      // hiccups during deploys.
      logger.debug({ err: err.message }, 'redis client error (suppressed)');
    });
    return singleton;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'redis client init failed');
    singleton = null;
    configuredUrl = undefined;
    return null;
  }
}

/** Test-only hook: drop the cached client so the next getRedis() rebuilds. */
export function __resetRedisForTests(): void {
  if (singleton) singleton.disconnect();
  singleton = null;
  configuredUrl = undefined;
}
