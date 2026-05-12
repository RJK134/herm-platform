/**
 * Unit tests for the tier-aware rate-limit primitives. Tests the pure
 * helpers (`tieredMax`, `tieredKey`) directly — exercising the rate
 * limiter's accept/reject behaviour end-to-end is covered in
 * apiRateLimit.integration.test.ts via supertest.
 */
import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { tieredMax, tieredKey } from './security';

function makeReq(overrides: Partial<Request> = {}): Request {
  return { ip: '127.0.0.1', ...overrides } as unknown as Request;
}

describe('tieredMax — per-tier rate-limit ceiling', () => {
  it('returns the anonymous ceiling when neither user nor apiUser is set', () => {
    expect(tieredMax(makeReq())).toBe(100);
  });

  it('returns the free ceiling for tier=free', () => {
    const req = makeReq({ user: { tier: 'free' } as never });
    expect(tieredMax(req)).toBe(300);
  });

  it('returns the professional ceiling for tier=professional', () => {
    const req = makeReq({ user: { tier: 'pro' } as never });
    expect(tieredMax(req)).toBe(1500);
  });

  it('returns the enterprise ceiling for tier=enterprise', () => {
    const req = makeReq({ user: { tier: 'enterprise' } as never });
    expect(tieredMax(req)).toBe(15000);
  });

  it('is case-insensitive on the tier string', () => {
    const req = makeReq({ user: { tier: 'ENTERPRISE' } as never });
    expect(tieredMax(req)).toBe(15000);
  });

  it('falls through to anonymous for an unknown tier value', () => {
    const req = makeReq({ user: { tier: 'mystery' } as never });
    expect(tieredMax(req)).toBe(100);
  });

  it('apiUser wins over user (API-key calls always get the API-key ceiling)', () => {
    const req = makeReq({
      user: { tier: 'free' } as never,
      apiUser: { id: 'k1', institutionId: 'i1', permissions: [], tier: 'enterprise' } as never,
    });
    expect(tieredMax(req)).toBe(600);
  });
});

describe('tieredKey — rate-limit bucket key', () => {
  it('falls back to ip:<ip> for anonymous callers', () => {
    expect(tieredKey(makeReq({ ip: '203.0.113.5' }))).toBe('ip:203.0.113.5');
  });

  it('uses user:<userId> for JWT-authenticated callers', () => {
    const req = makeReq({ user: { userId: 'u-42' } as never, ip: '203.0.113.5' });
    expect(tieredKey(req)).toBe('user:u-42');
  });

  it('uses apikey:<id> for API-key callers (preferred over JWT)', () => {
    const req = makeReq({
      user: { userId: 'u-42' } as never,
      apiUser: { id: 'k-99', institutionId: 'i', permissions: [], tier: 'enterprise' } as never,
      ip: '203.0.113.5',
    });
    expect(tieredKey(req)).toBe('apikey:k-99');
  });

  it('emits a stable value when ip is missing', () => {
    expect(tieredKey(makeReq({ ip: undefined }))).toBe('ip:unknown');
  });
});
