/**
 * Phase 11.16 (S1) — pin the Redis key shapes emitted by the central
 * `RedisKeys` builder. These are the strings ops + monitoring tooling
 * see, and downstream callers (lockout, session-store, flow-store,
 * slo-replay-cache) construct keys exclusively through this builder —
 * so any drift here is a deploy-blocking event.
 */
import { describe, it, expect } from 'vitest';
import { RedisKeys, REDIS_KEY_PREFIXES } from './redis-keys';

describe('RedisKeys', () => {
  it('sessionByJti returns `session:jti:<jti>`', () => {
    expect(RedisKeys.sessionByJti('abc123')).toBe('session:jti:abc123');
  });

  it('sessionRevoked returns `session:revoked:<jti>`', () => {
    expect(RedisKeys.sessionRevoked('abc123')).toBe('session:revoked:abc123');
  });

  it('sessionByNameId returns `session:nameid:<inst>:<nameId>`', () => {
    expect(RedisKeys.sessionByNameId('inst-1', 'alice@example.test')).toBe(
      'session:nameid:inst-1:alice@example.test',
    );
  });

  it('lockoutFail returns `lockout:fail:<hashedEmail>`', () => {
    expect(RedisKeys.lockoutFail('deadbeef')).toBe('lockout:fail:deadbeef');
  });

  it('lockoutLock returns `lockout:lock:<hashedEmail>`', () => {
    expect(RedisKeys.lockoutLock('deadbeef')).toBe('lockout:lock:deadbeef');
  });

  it('ssoOidcFlow returns `sso:oidc:flow:<state>`', () => {
    expect(RedisKeys.ssoOidcFlow('s-state-1')).toBe('sso:oidc:flow:s-state-1');
  });

  it('ssoSloReplay returns `sso:slo:replay:<inst>:<reqId>`', () => {
    expect(RedisKeys.ssoSloReplay('inst-1', '_req-r1')).toBe('sso:slo:replay:inst-1:_req-r1');
  });

  it('REDIS_KEY_PREFIXES lists every domain namespace, sorted alphabetically', () => {
    expect(REDIS_KEY_PREFIXES).toEqual(['lockout', 'session', 'sso:oidc:flow', 'sso:slo:replay']);
  });

  it('all builders return non-empty strings even with empty inputs (contract: always builds a key)', () => {
    // Defensive: a caller passing an empty string must not produce a
    // partial prefix-only key that could collide on `KEYS *`. The
    // builders always emit the trailing delimiter + value, so an empty
    // value yields a key ending in `:`.
    expect(RedisKeys.sessionByJti('')).toBe('session:jti:');
    expect(RedisKeys.lockoutFail('')).toBe('lockout:fail:');
    expect(RedisKeys.ssoOidcFlow('')).toBe('sso:oidc:flow:');
  });
});
