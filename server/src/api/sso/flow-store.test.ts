/**
 * Unit tests for the OIDC flow-store (Phase 11.15 — L5 fix).
 *
 * Pins the failure-mode contract:
 *   - `peekFlowState` fail-closes on Redis error (already shipped).
 *   - `takeFlowState` ALSO fail-closes on Redis error (new — was
 *     silently falling through to the in-memory Map). Falling back
 *     would race with the next take that hits a recovered Redis,
 *     producing a guaranteed auth failure on a recoverable blip.
 *   - Both functions still use the in-memory Map when Redis is unset
 *     (REDIS_URL absent) — local dev path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const redisMock = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn(),
  getdel: vi.fn(),
}));

const getRedisMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/redis', () => ({
  getRedis: getRedisMock,
}));

import { putFlowState, takeFlowState, peekFlowState, __resetFlowStoreForTests } from './flow-store';

const SAMPLE_FLOW = {
  slug: 'uni-1',
  codeVerifier: 'verifier-x',
  nonce: 'nonce-x',
  idpId: 'idp-x',
};

beforeEach(() => {
  __resetFlowStoreForTests();
  redisMock.set.mockReset();
  redisMock.get.mockReset();
  redisMock.getdel.mockReset();
  getRedisMock.mockReset();
});

// ── In-memory path (no Redis) ─────────────────────────────────────────────

describe('flow-store — in-memory path (Redis unset)', () => {
  beforeEach(() => {
    getRedisMock.mockReturnValue(null);
  });

  it('round-trips put → take', async () => {
    await putFlowState('state-1', SAMPLE_FLOW);
    const out = await takeFlowState('state-1');
    expect(out).toEqual(SAMPLE_FLOW);
  });

  it('takeFlowState consumes the record (subsequent take returns null)', async () => {
    await putFlowState('state-2', SAMPLE_FLOW);
    await takeFlowState('state-2');
    const second = await takeFlowState('state-2');
    expect(second).toBeNull();
  });

  it('peekFlowState is non-destructive', async () => {
    await putFlowState('state-3', SAMPLE_FLOW);
    const peeked = await peekFlowState('state-3');
    expect(peeked).toEqual(SAMPLE_FLOW);
    // Subsequent take still works — peek didn't consume.
    const taken = await takeFlowState('state-3');
    expect(taken).toEqual(SAMPLE_FLOW);
  });

  it('returns null for an unknown state', async () => {
    expect(await takeFlowState('never-stored')).toBeNull();
    expect(await peekFlowState('never-stored')).toBeNull();
  });
});

// ── Redis path (happy) ────────────────────────────────────────────────────

describe('flow-store — Redis path', () => {
  beforeEach(() => {
    getRedisMock.mockReturnValue(redisMock);
  });

  it('putFlowState issues SET ... EX NX', async () => {
    redisMock.set.mockResolvedValueOnce('OK');
    await putFlowState('s', SAMPLE_FLOW);
    expect(redisMock.set).toHaveBeenCalledWith(
      'sso:oidc:flow:s',
      JSON.stringify(SAMPLE_FLOW),
      'EX',
      expect.any(Number),
      'NX',
    );
  });

  it('takeFlowState issues GETDEL and parses the payload', async () => {
    redisMock.getdel.mockResolvedValueOnce(JSON.stringify(SAMPLE_FLOW));
    const out = await takeFlowState('s');
    expect(redisMock.getdel).toHaveBeenCalledWith('sso:oidc:flow:s');
    expect(out).toEqual(SAMPLE_FLOW);
  });

  it('peekFlowState issues GET and is non-destructive', async () => {
    redisMock.get.mockResolvedValueOnce(JSON.stringify(SAMPLE_FLOW));
    const out = await peekFlowState('s');
    expect(redisMock.get).toHaveBeenCalledWith('sso:oidc:flow:s');
    // GETDEL must NOT have been called.
    expect(redisMock.getdel).not.toHaveBeenCalled();
    expect(out).toEqual(SAMPLE_FLOW);
  });
});

// ── Failure-mode contract (Phase 11.15 — L5) ──────────────────────────────

describe('flow-store — Redis failure modes', () => {
  beforeEach(() => {
    getRedisMock.mockReturnValue(redisMock);
  });

  it('peekFlowState re-throws on Redis error (fail-closed — pre-existing)', async () => {
    redisMock.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(peekFlowState('any')).rejects.toThrow('ECONNREFUSED');
  });

  it('takeFlowState re-throws on Redis error (fail-closed — Phase 11.15 fix)', async () => {
    // BEFORE the fix this swallowed the error and returned null from the
    // empty in-memory Map, racing with a retry that succeeded against a
    // recovered Redis (the put-side stored the record there). The fix
    // is to re-throw so the OIDC callback redirects to the failure page
    // without consuming the flow state — the user retries cleanly.
    redisMock.getdel.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(takeFlowState('any')).rejects.toThrow('ECONNREFUSED');
  });

  it('takeFlowState does NOT silently fall back to memStore when Redis is configured', async () => {
    // Pre-populate the in-memory store from the put-side (simulates a
    // scenario where the put happened before Redis was wired, or where
    // a previous Redis blip caused a fallback write). With Redis configured
    // for take, a Redis failure must NOT serve the stale in-memory entry.
    getRedisMock.mockReturnValue(null);
    await putFlowState('stale', SAMPLE_FLOW);
    getRedisMock.mockReturnValue(redisMock);
    redisMock.getdel.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(takeFlowState('stale')).rejects.toThrow('ECONNREFUSED');
  });
});
