/**
 * Unit tests for the SAML SLO replay cache (Phase 11.15 — H2 fix).
 *
 * Pins the contract:
 *   - First record for a (institutionId, requestId) pair returns true;
 *     a duplicate within the TTL returns false.
 *   - TTL is `max(1, secondsUntil(NotOnOrAfter))` when present, else
 *     the default 300s.
 *   - Redis path issues `SET ... EX NX` so duplicates lose atomically.
 *   - Redis errors fall back to the in-memory Map (transient blip
 *     must not lock out legitimate logout traffic).
 *   - In-memory path expires entries after the TTL elapses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const redisMock = vi.hoisted(() => ({
  set: vi.fn(),
}));

const getRedisMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/redis', () => ({
  getRedis: getRedisMock,
}));

import {
  computeReplayTtlSeconds,
  recordSloRequest,
  DEFAULT_REPLAY_TTL_SECONDS,
  __resetSloReplayCacheForTests,
} from './slo-replay-cache';

beforeEach(() => {
  __resetSloReplayCacheForTests();
  redisMock.set.mockReset();
  getRedisMock.mockReset();
});

// ── TTL computation ───────────────────────────────────────────────────────

describe('computeReplayTtlSeconds', () => {
  it('returns the default when NotOnOrAfter is undefined', () => {
    expect(computeReplayTtlSeconds(undefined)).toBe(DEFAULT_REPLAY_TTL_SECONDS);
  });

  it('returns the default when NotOnOrAfter is unparseable', () => {
    expect(computeReplayTtlSeconds('not-an-iso')).toBe(DEFAULT_REPLAY_TTL_SECONDS);
  });

  it('returns the secondsUntilExpiry when in the future', () => {
    const now = Date.parse('2026-05-01T00:00:00Z');
    const expiry = '2026-05-01T00:02:30Z'; // +150s
    expect(computeReplayTtlSeconds(expiry, now)).toBe(150);
  });

  it('floors at 1 second when NotOnOrAfter has already passed', () => {
    // Already-expired LogoutRequest: still record so an immediate retry
    // within the same handler is rejected; SET EX 0 would be invalid.
    const now = Date.parse('2026-05-01T00:00:00Z');
    const expiry = '2026-04-30T23:00:00Z';
    expect(computeReplayTtlSeconds(expiry, now)).toBe(1);
  });

  it('rounds up sub-second remainders so the cache outlives the assertion window', () => {
    const now = Date.parse('2026-05-01T00:00:00.000Z');
    const expiry = '2026-05-01T00:00:00.500Z'; // +0.5s
    expect(computeReplayTtlSeconds(expiry, now)).toBe(1);
  });
});

// ── In-memory path (no Redis) ─────────────────────────────────────────────

describe('recordSloRequest — in-memory path (Redis unset)', () => {
  beforeEach(() => {
    getRedisMock.mockReturnValue(null);
  });

  it('returns true on first record, false on duplicate within TTL', async () => {
    const first = await recordSloRequest('inst-1', 'req-1', 60);
    expect(first).toBe(true);
    const second = await recordSloRequest('inst-1', 'req-1', 60);
    expect(second).toBe(false);
  });

  it('scopes by institutionId — same requestId in a different tenant is allowed', async () => {
    expect(await recordSloRequest('inst-A', 'shared-id', 60)).toBe(true);
    expect(await recordSloRequest('inst-B', 'shared-id', 60)).toBe(true);
  });

  it('expires entries after the TTL elapses', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-01T00:00:00Z'));
      expect(await recordSloRequest('inst-1', 'req-ttl', 5)).toBe(true);
      vi.setSystemTime(new Date('2026-05-01T00:00:06Z')); // +6s, past TTL
      expect(await recordSloRequest('inst-1', 'req-ttl', 5)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── Redis path ─────────────────────────────────────────────────────────────

describe('recordSloRequest — Redis path', () => {
  beforeEach(() => {
    getRedisMock.mockReturnValue(redisMock);
  });

  it('issues SET ... EX <ttl> NX with a namespaced key', async () => {
    redisMock.set.mockResolvedValueOnce('OK');
    const ok = await recordSloRequest('inst-1', 'req-r1', 200);
    expect(ok).toBe(true);
    expect(redisMock.set).toHaveBeenCalledWith(
      'sso:slo:replay:inst-1:req-r1',
      '1',
      'EX',
      200,
      'NX',
    );
  });

  it('returns false when the SET NX loses the race (duplicate replay)', async () => {
    redisMock.set.mockResolvedValueOnce(null);
    const ok = await recordSloRequest('inst-1', 'req-dup', 200);
    expect(ok).toBe(false);
  });

  it('falls back to the in-memory Map when Redis throws', async () => {
    // Transient Redis blip must not lock out legitimate logout traffic.
    redisMock.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const first = await recordSloRequest('inst-1', 'req-blip', 60);
    expect(first).toBe(true);
    // Subsequent record (also blipped) hits the populated mem store →
    // duplicate is rejected.
    redisMock.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const second = await recordSloRequest('inst-1', 'req-blip', 60);
    expect(second).toBe(false);
  });
});
