/**
 * Account lockout — credential-stuffing defence (Phase 10.5).
 *
 * After {MAX_FAILS} consecutive failed logins for a given email within
 * {WINDOW_MS}, the account is locked for {LOCK_MS}. The lockout check
 * runs BEFORE bcrypt.compare so a locked account doesn't burn CPU on
 * every attacker attempt — the lock check is O(1).
 *
 * Storage: in-process Map for now. Single-instance deployments
 * (current state) are fully covered. As soon as we run multi-instance
 * pods, this MUST move behind a shared store (Redis) — otherwise an
 * attacker can rotate IPs and hit different instances to evade the
 * counter. P10.6 brings Redis online for the readiness probe; a
 * follow-up swaps this module's backing store.
 *
 * Lockout policy:
 *   - 5 failed attempts in 15 minutes → 30-minute lockout.
 *   - A successful login clears all failure history for that email.
 *   - Counters live keyed by lower-cased email so case variations don't
 *     reset the counter.
 *   - The lockout window slides: while locked, additional failed
 *     attempts do NOT extend the timer (otherwise an attacker can
 *     keep an account locked indefinitely as a DoS).
 *   - SUPER_ADMIN-driven manual unlock can land in a follow-up; for
 *     now operators can exec into a pod and call `clearFailures()`
 *     for a specific email.
 *
 * Test hooks: `__resetLockoutForTests()`.
 */
import { logger } from './logger';
import { AppError } from '../utils/errors';

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 30 * 60 * 1000;

// Maximum number of distinct email keys held in the store at any one time.
// When the store reaches this limit, the oldest (first-inserted) entry is
// evicted before a new one is added. This bounds the memory an attacker can
// consume by flooding the login endpoint with unique email addresses.
const MAX_STORE_SIZE = 10_000;
// Runtime cap — equals MAX_STORE_SIZE in production; lowered only by the
// __overrideMaxStoreSizeForTests() test hook.
let maxStoreSizeCap = MAX_STORE_SIZE;

/**
 * Sentinel error thrown when the email is locked out due to repeated
 * failed login attempts. Lives in the lockout module (not in auth.service)
 * so test files that mock the auth service don't lose access to the
 * class — `instanceof` checks in the controller need the real class.
 *
 * Translates to HTTP 429 + the standard `Retry-After` header at the
 * controller boundary; the client renders a specific lockout message.
 *
 * `newlyEngaged` is true only when this attempt is the one that caused
 * the lockout to engage (the boundary attempt). Subsequent attempts
 * against an already-locked account set this to false so the controller
 * can emit `auth.lockout.engaged` exactly once per lockout event.
 */
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
  /** Recent failure timestamps within WINDOW_MS. Older entries pruned on every check. */
  attempts: number[];
  /** When != null, the account is locked until this timestamp. */
  lockedUntil: number | null;
}

const store = new Map<string, FailureRecord>();
let clockFn: () => number = Date.now;

function now(): number {
  return clockFn();
}

function key(email: string): string {
  return email.toLowerCase().trim();
}

function pruneAttempts(record: FailureRecord, t: number): void {
  const cutoff = t - WINDOW_MS;
  record.attempts = record.attempts.filter((ts) => ts > cutoff);
}

export interface LockoutState {
  /** Whether the account is currently locked. */
  locked: boolean;
  /** Wall-clock ms until the lock expires. 0 when not locked. */
  retryAfterMs: number;
  /** How many attempts remain before lockout engages. */
  attemptsRemaining: number;
}

/**
 * Inspect the lockout state for an email. O(1) — call this BEFORE
 * bcrypt.compare so a locked account doesn't burn CPU per attempt.
 */
export function checkLockout(email: string): LockoutState {
  const k = key(email);
  const record = store.get(k);
  const t = now();

  if (!record) {
    return { locked: false, retryAfterMs: 0, attemptsRemaining: MAX_FAILS };
  }

  if (record.lockedUntil && record.lockedUntil > t) {
    return { locked: true, retryAfterMs: record.lockedUntil - t, attemptsRemaining: 0 };
  }

  // Lock window expired — clear the lock and the attempt history.
  if (record.lockedUntil && record.lockedUntil <= t) {
    record.lockedUntil = null;
    record.attempts = [];
  }

  pruneAttempts(record, t);
  // Remove entries that carry no active state to keep the store bounded.
  if (record.attempts.length === 0 && !record.lockedUntil) {
    store.delete(k);
  }
  return {
    locked: false,
    retryAfterMs: 0,
    attemptsRemaining: Math.max(0, MAX_FAILS - record.attempts.length),
  };
}

/**
 * Record a failed login. Engages lockout when MAX_FAILS is reached.
 * Returns the post-record state so the caller can decide whether to
 * surface a "your account is locked" message vs the generic 401.
 */
export function recordFailure(email: string): LockoutState {
  const k = key(email);
  const t = now();
  const isNew = !store.has(k);
  const record = store.get(k) ?? { attempts: [], lockedUntil: null };

  // Evict the oldest (first-inserted) entry when the store is full and a new
  // key is about to be added. This caps memory under a unique-email flood.
  if (isNew && store.size >= maxStoreSizeCap) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) {
      store.delete(oldest);
    }
  }
  store.set(k, record);

  // Already locked: don't extend the timer (DoS resistance).
  if (record.lockedUntil && record.lockedUntil > t) {
    return { locked: true, retryAfterMs: record.lockedUntil - t, attemptsRemaining: 0 };
  }

  // Expired lock: clear stale lock state before counting a new failure.
  if (record.lockedUntil && record.lockedUntil <= t) {
    record.lockedUntil = null;
    record.attempts = [];
  }

  pruneAttempts(record, t);
  record.attempts.push(t);

  if (record.attempts.length >= MAX_FAILS) {
    record.lockedUntil = t + LOCK_MS;
    record.attempts = []; // free the array; we hold the lock instead
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

/**
 * Clear all failure history for an email. Called on successful login
 * so a forgotten password followed by a correct one doesn't carry
 * state forward into the next session.
 */
export function clearFailures(email: string): void {
  store.delete(key(email));
}

/** Test hook: full reset. */
export function __resetLockoutForTests(): void {
  store.clear();
  clockFn = Date.now;
  maxStoreSizeCap = MAX_STORE_SIZE;
}

/** Test hook: pin the clock so window/lock arithmetic is deterministic. */
export function __overrideLockoutClock(fn: () => number): void {
  clockFn = fn;
}

/** Test hook: lower the store cap so memory-bound tests don't need 10k entries. */
export function __overrideMaxStoreSizeForTests(n: number): void {
  maxStoreSizeCap = n;
}

/** Returns the current number of entries in the store. For tests only. */
export function __getStoreSizeForTests(): number {
  return store.size;
}

/** Tunables exposed for tests + audit messages. */
export const LOCKOUT_CONFIG = { MAX_FAILS, WINDOW_MS, LOCK_MS, MAX_STORE_SIZE } as const;
