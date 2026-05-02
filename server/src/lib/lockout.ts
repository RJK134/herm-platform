/**
 * Account lockout — credential-stuffing defence.
 *
 * Phase 10.5 introduced the in-memory implementation: 5 failed attempts
 * within 15 minutes engages a 30-minute lockout, with O(1) checks and
 * an LRU-bounded store. Phase 10.9 (this revision) swaps the backing
 * store to Redis when `REDIS_URL` is configured — multi-instance
 * deployments share a single counter, so an attacker can't rotate
 * across pods to evade the limit.
 *
 * Backing-store selection is per-call. If `getRedis()` returns a client,
 * the public API dispatches to the Redis implementation; otherwise it
 * falls back to the in-process Map. Local dev (no `REDIS_URL`) and
 * single-instance prod continue to work unchanged.
 *
 * Lockout policy (unchanged from P10.5):
 *   - 5 failed attempts in 15 minutes → 30-minute lockout.
 *   - A successful login clears all failure history for that email.
 *   - Counters live keyed by lower-cased + trimmed email.
 *   - The lockout window is fixed once engaged: while locked, additional
 *     failed attempts do NOT extend the timer (otherwise an attacker can
 *     keep an account locked indefinitely as a DoS).
 *
 * Public API change: the three exported functions are now async. The
 * shape of `LockoutState` and `AccountLockedError` is unchanged. Call
 * sites await; the only producer is `auth.service.ts::login`.
 *
 * Test hooks (`__resetLockoutForTests`, `__overrideLockoutClock`,
 * `__overrideMaxStoreSizeForTests`, `__getStoreSizeForTests`) operate
 * on the in-memory store. The Redis path uses Redis-server-side time
 * for TTLs, so these hooks deliberately do NOT influence it — Redis
 * tests use a mocked client and assert on observed Redis commands
 * instead.
 */
import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { logger } from './logger';
import { AppError } from '../utils/errors';
import { getRedis } from './redis';
import { RedisKeys } from './redis-keys';

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 30 * 60 * 1000;

const MAX_STORE_SIZE = 10_000;
let maxStoreSizeCap = MAX_STORE_SIZE;


export class AccountLockedError extends AppError {
  constructor(
    public readonly retryAfterSeconds: number,
    public readonly newlyEngaged: boolean = false,
  ) {
    super(
      429,
      'AUTH_LOCKED',
      `Account temporarily locked after ${MAX_FAILS} failed attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
    );
    this.name = 'AccountLockedError';
  }
}

interface FailureRecord {
  attempts: number[];
  lockedUntil: number | null;
}

const memStore = new Map<string, FailureRecord>();
let clockFn: () => number = Date.now;

function now(): number {
  return clockFn();
}

function key(email: string): string {
  return email.toLowerCase().trim();
}

export interface LockoutState {
  locked: boolean;
  retryAfterMs: number;
  attemptsRemaining: number;
}

// ── In-memory backing store (unchanged behaviour from Phase 10.5) ──────────

function pruneAttempts(record: FailureRecord, t: number): void {
  const cutoff = t - WINDOW_MS;
  record.attempts = record.attempts.filter((ts) => ts > cutoff);
}

function checkLockoutMemory(email: string): LockoutState {
  const k = key(email);
  const record = memStore.get(k);
  const t = now();

  if (!record) {
    return { locked: false, retryAfterMs: 0, attemptsRemaining: MAX_FAILS };
  }

  if (record.lockedUntil && record.lockedUntil > t) {
    return { locked: true, retryAfterMs: record.lockedUntil - t, attemptsRemaining: 0 };
  }

  if (record.lockedUntil && record.lockedUntil <= t) {
    record.lockedUntil = null;
    record.attempts = [];
  }

  pruneAttempts(record, t);
  if (record.attempts.length === 0 && !record.lockedUntil) {
    memStore.delete(k);
  }
  return {
    locked: false,
    retryAfterMs: 0,
    attemptsRemaining: Math.max(0, MAX_FAILS - record.attempts.length),
  };
}

function recordFailureMemory(email: string): LockoutState {
  const k = key(email);
  const t = now();
  const isNew = !memStore.has(k);
  const record = memStore.get(k) ?? { attempts: [], lockedUntil: null };

  if (isNew && memStore.size >= maxStoreSizeCap) {
    const oldest = memStore.keys().next().value;
    if (oldest !== undefined) {
      memStore.delete(oldest);
    }
  }
  memStore.set(k, record);

  if (record.lockedUntil && record.lockedUntil > t) {
    return { locked: true, retryAfterMs: record.lockedUntil - t, attemptsRemaining: 0 };
  }

  if (record.lockedUntil && record.lockedUntil <= t) {
    record.lockedUntil = null;
    record.attempts = [];
  }

  pruneAttempts(record, t);
  record.attempts.push(t);

  if (record.attempts.length >= MAX_FAILS) {
    record.lockedUntil = t + LOCK_MS;
    record.attempts = [];
    logger.warn(
      { email: k, lockMs: LOCK_MS, maxFails: MAX_FAILS },
      'auth.lockout.engaged — too many failed attempts',
    );
    return { locked: true, retryAfterMs: LOCK_MS, attemptsRemaining: 0 };
  }

  return {
    locked: false,
    retryAfterMs: 0,
    attemptsRemaining: MAX_FAILS - record.attempts.length,
  };
}

function clearFailuresMemory(email: string): void {
  memStore.delete(key(email));
}

// ── Redis-backed backing store (Phase 10.9) ────────────────────────────────
//
// Two keys per email, both auto-expiring:
//   lockout:fail:<email>  Sorted set; member=score=ms timestamp; TTL = WINDOW_MS
//   lockout:lock:<email>  String "1"; TTL = LOCK_MS
//
// `lockout:fail:*` self-expires after WINDOW_MS of inactivity, so an
// abandoned counter doesn't leak storage. The lock key auto-expires too,
// so a forgotten account naturally unlocks without manual cleanup.

function failKey(email: string): string {
  return RedisKeys.lockoutFail(key(email));
}
function lockKey(email: string): string {
  return RedisKeys.lockoutLock(key(email));
}

/**
 * Read Redis's wall clock (TIME command). Used in place of `Date.now()`
 * for sliding-window arithmetic so multi-pod deployments can't disagree
 * on what "now" is — which is the entire reason for migrating off the
 * in-process Map. Each operation snapshots once at entry and reuses it
 * for prune-cutoff and ZADD score so there is no intra-call drift.
 *
 * Cost: one extra round trip per public call. Cheap on a local-network
 * Redis; well under the p99 budget the platform cares about.
 */
async function redisNow(client: Redis): Promise<number> {
  const reply = await client.time();
  // ioredis returns [seconds, microseconds] as strings.
  const seconds = Number(reply[0]);
  const micros = Number(reply[1]);
  return seconds * 1000 + Math.floor(micros / 1000);
}

/**
 * Build a unique ZSET member for the failure record. Sorted-set members
 * must be unique: if two failures land in the same millisecond and we
 * use just `t.toString()` as the member, ZADD overwrites the first
 * record instead of incrementing cardinality, undercounting attempts
 * and delaying lockout. The score stays as the integer timestamp so
 * `zremrangebyscore` window pruning is unaffected.
 */
function uniqueAttemptMember(t: number): string {
  return `${t}-${randomBytes(4).toString('hex')}`;
}

async function checkLockoutRedis(client: Redis, email: string): Promise<LockoutState> {
  const fk = failKey(email);
  const lk = lockKey(email);

  const lockTtlMs = await client.pttl(lk);
  if (lockTtlMs > 0) {
    return { locked: true, retryAfterMs: lockTtlMs, attemptsRemaining: 0 };
  }

  // Prune attempts older than the sliding window before counting.
  const t = await redisNow(client);
  await client.zremrangebyscore(fk, 0, t - WINDOW_MS);
  const count = await client.zcard(fk);
  return {
    locked: false,
    retryAfterMs: 0,
    attemptsRemaining: Math.max(0, MAX_FAILS - count),
  };
}

async function recordFailureRedis(client: Redis, email: string): Promise<LockoutState> {
  const fk = failKey(email);
  const lk = lockKey(email);

  // DoS resistance: if a lock already exists, do not extend it. Surface
  // the existing TTL as `retryAfterMs` so the caller can render a
  // truthful Retry-After header.
  const lockTtlMs = await client.pttl(lk);
  if (lockTtlMs > 0) {
    return { locked: true, retryAfterMs: lockTtlMs, attemptsRemaining: 0 };
  }

  const t = await redisNow(client);
  // Append this failure, refresh the window TTL, and prune in one round
  // trip per command. We don't pipeline because ioredis's PIPELINE
  // semantics complicate error-handling — and these are 4 cheap commands
  // against a local-network Redis, well under any p99 budget the platform
  // cares about.
  //
  // Score = millisecond timestamp (used by zremrangebyscore to prune by
  // age). Member = `<score>-<random hex>` so two failures at the same
  // millisecond don't collide and silently overwrite — sorted-set
  // members are deduplicated, so reusing the timestamp as both fields
  // would let an attacker spamming concurrent requests stay under the
  // counter. Any unique-per-call suffix works; 4 random bytes is
  // overkill but cheap.
  await client.zadd(fk, t, uniqueAttemptMember(t));
  await client.pexpire(fk, WINDOW_MS);
  await client.zremrangebyscore(fk, 0, t - WINDOW_MS);
  const count = await client.zcard(fk);

  if (count >= MAX_FAILS) {
    // Engage the lock atomically with NX so a concurrent boundary attempt
    // doesn't race us into double-engaging (which would be harmless but
    // would split the audit trail). On race, the loser surfaces the
    // existing TTL as if they were a post-engagement attempt.
    const ok = await client.set(lk, '1', 'PX', LOCK_MS, 'NX');
    if (ok === 'OK') {
      // We hold the lock — clear the fail set so post-lock attempts hit
      // the early-return PTTL branch above instead of accumulating.
      await client.del(fk);
      logger.warn(
        { email: key(email), lockMs: LOCK_MS, maxFails: MAX_FAILS },
        'auth.lockout.engaged — too many failed attempts (redis)',
      );
      return { locked: true, retryAfterMs: LOCK_MS, attemptsRemaining: 0 };
    }
    // Race-loser path — read the actual TTL of the lock the winner set.
    const ttl = await client.pttl(lk);
    return { locked: true, retryAfterMs: ttl > 0 ? ttl : LOCK_MS, attemptsRemaining: 0 };
  }

  return {
    locked: false,
    retryAfterMs: 0,
    attemptsRemaining: MAX_FAILS - count,
  };
}

async function clearFailuresRedis(client: Redis, email: string): Promise<void> {
  await client.del(failKey(email), lockKey(email));
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Inspect the lockout state for an email. Cheap (one PTTL + one ZCARD on
 * Redis; one Map lookup on the in-memory path). Call this BEFORE bcrypt
 * so a locked account doesn't burn CPU per attempt.
 */
export async function checkLockout(email: string): Promise<LockoutState> {
  const client = getRedis();
  if (client) {
    try {
      return await checkLockoutRedis(client, email);
    } catch (err) {
      // Fail open: if Redis is unreachable mid-request, prefer letting
      // login proceed (with the in-memory fallback's view of the world)
      // over locking out everyone. Operators see the readiness probe go
      // amber; the alternative is a Redis blip causing total outage.
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'lockout: redis check failed, falling back to in-memory',
      );
      return checkLockoutMemory(email);
    }
  }
  return checkLockoutMemory(email);
}

/**
 * Record a failed login. Engages lockout when MAX_FAILS is reached.
 * Returns the post-record state so the caller can decide whether to
 * surface a "your account is locked" message vs the generic 401.
 */
export async function recordFailure(email: string): Promise<LockoutState> {
  const client = getRedis();
  if (client) {
    try {
      return await recordFailureRedis(client, email);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'lockout: redis record failed, falling back to in-memory',
      );
      return recordFailureMemory(email);
    }
  }
  return recordFailureMemory(email);
}

/**
 * Clear all failure history for an email. Called on successful login
 * so a forgotten password followed by a correct one doesn't carry
 * state forward into the next session.
 */
export async function clearFailures(email: string): Promise<void> {
  const client = getRedis();
  if (client) {
    try {
      await clearFailuresRedis(client, email);
      return;
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'lockout: redis clear failed, falling back to in-memory',
      );
    }
  }
  clearFailuresMemory(email);
}

// ── Test hooks (in-memory path only) ───────────────────────────────────────

export function __resetLockoutForTests(): void {
  memStore.clear();
  clockFn = Date.now;
  maxStoreSizeCap = MAX_STORE_SIZE;
}

export function __overrideLockoutClock(fn: () => number): void {
  clockFn = fn;
}

export function __overrideMaxStoreSizeForTests(n: number): void {
  maxStoreSizeCap = n;
}

export function __getStoreSizeForTests(): number {
  return memStore.size;
}

export const LOCKOUT_CONFIG = { MAX_FAILS, WINDOW_MS, LOCK_MS, MAX_STORE_SIZE } as const;

/**
 * Test hook: build the same Redis key strings the production path uses,
 * so Redis-path tests can assert on the right keys without duplicating
 * the prefix convention.
 */
export const __redisKeysForTests = { failKey, lockKey };
