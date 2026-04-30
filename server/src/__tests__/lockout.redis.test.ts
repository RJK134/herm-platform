/**
 * Phase 10.9: Redis-backed lockout store.
 *
 * The in-memory contract is already covered by `lockout.test.ts`. These
 * tests pin the Redis dispatch path: when `getRedis()` returns a client,
 * the public functions use ioredis commands (PTTL, ZADD, ZCARD, etc.)
 * to read/write the shared store. We mock the client so the assertions
 * are about which commands are issued in which order, rather than
 * spinning up a live Redis.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const redisMock = vi.hoisted(() => ({
  pttl: vi.fn(),
  zadd: vi.fn(),
  pexpire: vi.fn(),
  zremrangebyscore: vi.fn(),
  zcard: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  // Redis TIME — returns [seconds, microseconds] as decimal strings.
  // Default to a fixed point so window arithmetic is deterministic;
  // individual tests can override.
  time: vi.fn(),
}));

vi.mock('../lib/redis', () => ({
  getRedis: () => redisMock,
}));

import {
  checkLockout,
  recordFailure,
  clearFailures,
  LOCKOUT_CONFIG,
  __redisKeysForTests,
  __resetLockoutForTests,
} from '../lib/lockout';

beforeEach(() => {
  __resetLockoutForTests();
  redisMock.pttl.mockReset();
  redisMock.zadd.mockReset().mockResolvedValue(1);
  redisMock.pexpire.mockReset().mockResolvedValue(1);
  redisMock.zremrangebyscore.mockReset().mockResolvedValue(0);
  redisMock.zcard.mockReset();
  redisMock.set.mockReset();
  redisMock.del.mockReset().mockResolvedValue(1);
  // Redis TIME default: a fixed timestamp so prune-cutoff arithmetic
  // is deterministic across tests. Tests that need a specific clock
  // override with `mockResolvedValueOnce`.
  redisMock.time.mockReset().mockResolvedValue(['1700000000', '0']);
});

describe('lockout — redis backend dispatch', () => {
  const email = 'a@b.test';
  const fk = __redisKeysForTests.failKey(email);
  const lk = __redisKeysForTests.lockKey(email);

  it('checkLockout returns open when no lock + zero attempts', async () => {
    redisMock.pttl.mockResolvedValueOnce(-2); // key doesn't exist
    redisMock.zcard.mockResolvedValueOnce(0);

    const state = await checkLockout(email);

    expect(state).toEqual({
      locked: false,
      retryAfterMs: 0,
      attemptsRemaining: LOCKOUT_CONFIG.MAX_FAILS,
    });
    expect(redisMock.pttl).toHaveBeenCalledWith(lk);
    expect(redisMock.zremrangebyscore).toHaveBeenCalled();
    expect(redisMock.zcard).toHaveBeenCalledWith(fk);
  });

  it('checkLockout reports locked + the actual TTL when a lock key exists', async () => {
    redisMock.pttl.mockResolvedValueOnce(120_000); // 2 minutes left

    const state = await checkLockout(email);

    expect(state.locked).toBe(true);
    expect(state.retryAfterMs).toBe(120_000);
    expect(state.attemptsRemaining).toBe(0);
    // No need to check the fail-set when already locked.
    expect(redisMock.zcard).not.toHaveBeenCalled();
  });

  it('recordFailure adds an attempt and decrements attemptsRemaining', async () => {
    redisMock.pttl.mockResolvedValueOnce(-2);
    redisMock.zcard.mockResolvedValueOnce(2);

    const state = await recordFailure(email);

    expect(state.locked).toBe(false);
    expect(state.attemptsRemaining).toBe(LOCKOUT_CONFIG.MAX_FAILS - 2);
    expect(redisMock.zadd).toHaveBeenCalledWith(fk, expect.any(Number), expect.any(String));
    expect(redisMock.pexpire).toHaveBeenCalledWith(fk, LOCKOUT_CONFIG.WINDOW_MS);
  });

  it('recordFailure engages the lockout (SET NX) when ZCARD reaches MAX_FAILS', async () => {
    redisMock.pttl.mockResolvedValueOnce(-2);
    redisMock.zcard.mockResolvedValueOnce(LOCKOUT_CONFIG.MAX_FAILS);
    redisMock.set.mockResolvedValueOnce('OK');

    const state = await recordFailure(email);

    expect(state.locked).toBe(true);
    expect(state.retryAfterMs).toBe(LOCKOUT_CONFIG.LOCK_MS);
    expect(redisMock.set).toHaveBeenCalledWith(lk, '1', 'PX', LOCKOUT_CONFIG.LOCK_MS, 'NX');
    // Fail set is cleared so post-lock attempts hit the PTTL early-return.
    expect(redisMock.del).toHaveBeenCalledWith(fk);
  });

  it('recordFailure surfaces existing TTL when a concurrent request won the SET NX race', async () => {
    redisMock.pttl
      .mockResolvedValueOnce(-2) // first PTTL: lock not yet set
      .mockResolvedValueOnce(900_000); // second PTTL after losing race: 15min remaining
    redisMock.zcard.mockResolvedValueOnce(LOCKOUT_CONFIG.MAX_FAILS);
    redisMock.set.mockResolvedValueOnce(null); // SET NX returned null = lost race

    const state = await recordFailure(email);

    expect(state.locked).toBe(true);
    expect(state.retryAfterMs).toBe(900_000);
    // Fail set must NOT be deleted in the race-loser path — the winner
    // already cleared it.
    expect(redisMock.del).not.toHaveBeenCalled();
  });

  it('recordFailure short-circuits when already locked (DoS resistance — no extension)', async () => {
    redisMock.pttl.mockResolvedValueOnce(60_000); // 1min remaining

    const state = await recordFailure(email);

    expect(state.locked).toBe(true);
    expect(state.retryAfterMs).toBe(60_000);
    // Never even touched the fail set — the early return makes locked
    // accounts cheap to query under attack.
    expect(redisMock.zadd).not.toHaveBeenCalled();
    expect(redisMock.zcard).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('clearFailures deletes both keys', async () => {
    await clearFailures(email);

    expect(redisMock.del).toHaveBeenCalledWith(fk, lk);
  });

  it('ZADD member is unique per call so same-ms concurrent failures do NOT dedupe', async () => {
    // Bugbot/Copilot-flagged regression: if member == score == ms timestamp,
    // two failures landing in the same millisecond would silently overwrite
    // each other (sorted-set members are deduplicated), undercounting
    // attempts and delaying lockout. Pin the contract: ZADD must be called
    // with a unique member each time, even when the score is identical.
    redisMock.pttl.mockResolvedValue(-2);
    redisMock.zcard.mockResolvedValue(1);
    // Pin Redis TIME to the same ms across both calls — this is the
    // concurrent-burst case the regression test is about.
    redisMock.time.mockResolvedValue(['1700000000', '500000']);

    await recordFailure(email);
    await recordFailure(email);

    // Both calls used the same score (1700000000500 ms) but the members
    // must differ.
    const calls = redisMock.zadd.mock.calls;
    expect(calls).toHaveLength(2);
    const [, scoreA, memberA] = calls[0]!;
    const [, scoreB, memberB] = calls[1]!;
    expect(scoreA).toBe(scoreB);
    expect(memberA).not.toBe(memberB);
  });

  it('uses Redis TIME (not Date.now) for window arithmetic', async () => {
    // Pin: the implementation must consult Redis server time so multi-pod
    // deployments don't disagree on "now". The whole point of moving off
    // the in-process Map is multi-instance correctness.
    redisMock.pttl.mockResolvedValueOnce(-2);
    redisMock.zcard.mockResolvedValueOnce(0);
    redisMock.time.mockResolvedValueOnce(['1700000123', '456000']);

    await checkLockout(email);

    expect(redisMock.time).toHaveBeenCalled();
    // Prune cutoff = (1700000123*1000 + 456) - WINDOW_MS
    const expectedCutoff = 1700000123 * 1000 + 456 - LOCKOUT_CONFIG.WINDOW_MS;
    expect(redisMock.zremrangebyscore).toHaveBeenCalledWith(fk, 0, expectedCutoff);
  });

  it('email key is case-insensitive + trim-normalised in Redis paths too', async () => {
    redisMock.pttl.mockResolvedValueOnce(-2);
    redisMock.zcard.mockResolvedValueOnce(0);

    await checkLockout('  Mixed.Case@Example.Test  ');

    const expectedFk = __redisKeysForTests.failKey('mixed.case@example.test');
    const expectedLk = __redisKeysForTests.lockKey('mixed.case@example.test');
    expect(redisMock.pttl).toHaveBeenCalledWith(expectedLk);
    expect(redisMock.zcard).toHaveBeenCalledWith(expectedFk);
  });
});

describe('lockout — redis failure → in-memory fallback', () => {
  it('checkLockout falls back to in-memory when Redis throws', async () => {
    redisMock.pttl.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const state = await checkLockout('fallback@example.test');

    // In-memory default for an unseen email.
    expect(state).toEqual({
      locked: false,
      retryAfterMs: 0,
      attemptsRemaining: LOCKOUT_CONFIG.MAX_FAILS,
    });
  });

  it('recordFailure falls back to in-memory when Redis throws', async () => {
    redisMock.pttl.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const state = await recordFailure('fallback@example.test');

    // First in-memory failure for an unseen email — counter goes from
    // MAX_FAILS to MAX_FAILS-1, not locked.
    expect(state.locked).toBe(false);
    expect(state.attemptsRemaining).toBe(LOCKOUT_CONFIG.MAX_FAILS - 1);
  });
});
