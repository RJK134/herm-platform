/**
 * Phase 11.12 — session store unit tests.
 *
 * Exercises the in-memory backend (the Redis path is tested
 * implicitly when REDIS_URL is set; here we lock the contract that
 * the in-memory fallback honours, since dev / test envs run on it).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSession,
  isRevoked,
  isRevokedSync,
  revokeSession,
  revokeBySamlSubject,
  _resetSessionStoreForTests,
  type SessionRecord,
} from './session-store';

const baseRec = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  jti: 'jti-1',
  userId: 'usr-1',
  institutionId: 'inst-1',
  expiresAt: Date.now() + 60_000,
  ...over,
});

beforeEach(() => {
  _resetSessionStoreForTests();
});

describe('session-store (in-memory backend)', () => {
  it('records a session and reports it as not revoked', async () => {
    await recordSession(baseRec());
    expect(await isRevoked('jti-1')).toBe(false);
    expect(isRevokedSync('jti-1')).toBe(false);
  });

  it('revokeSession marks the jti as revoked', async () => {
    await recordSession(baseRec());
    await revokeSession('jti-1');
    expect(await isRevoked('jti-1')).toBe(true);
    expect(isRevokedSync('jti-1')).toBe(true);
  });

  it('revokeSession works on an unknown jti (idempotent)', async () => {
    await revokeSession('jti-never-issued');
    expect(await isRevoked('jti-never-issued')).toBe(true);
  });

  it('revokeBySamlSubject revokes every session for a (institutionId, nameId) pair', async () => {
    await recordSession(baseRec({ jti: 'jti-1', samlNameId: 'alice@uni.test', samlSessionIndex: 'idx-a' }));
    await recordSession(baseRec({ jti: 'jti-2', samlNameId: 'alice@uni.test', samlSessionIndex: 'idx-b' }));
    await recordSession(baseRec({ jti: 'jti-3', samlNameId: 'bob@uni.test' }));
    const n = await revokeBySamlSubject('inst-1', 'alice@uni.test');
    expect(n).toBe(2);
    expect(await isRevoked('jti-1')).toBe(true);
    expect(await isRevoked('jti-2')).toBe(true);
    expect(await isRevoked('jti-3')).toBe(false);
  });

  it('revokeBySamlSubject narrows on SessionIndex when provided', async () => {
    await recordSession(baseRec({ jti: 'jti-1', samlNameId: 'alice@uni.test', samlSessionIndex: 'idx-a' }));
    await recordSession(baseRec({ jti: 'jti-2', samlNameId: 'alice@uni.test', samlSessionIndex: 'idx-b' }));
    const n = await revokeBySamlSubject('inst-1', 'alice@uni.test', 'idx-a');
    expect(n).toBe(1);
    expect(await isRevoked('jti-1')).toBe(true);
    expect(await isRevoked('jti-2')).toBe(false);
  });

  it('revokeBySamlSubject returns 0 when no sessions match', async () => {
    await recordSession(baseRec({ samlNameId: 'alice@uni.test' }));
    const n = await revokeBySamlSubject('inst-1', 'nobody@uni.test');
    expect(n).toBe(0);
  });

  it('isRevoked drops expired tombstones on read', async () => {
    // Record + revoke with an already-expired session: the tombstone
    // is set with the session's TTL; if the session was already
    // expired, the tombstone expires immediately and the next read
    // reports not-revoked.
    await recordSession(baseRec({ jti: 'jti-stale', expiresAt: Date.now() - 1000 }));
    await revokeSession('jti-stale');
    // Force-expire the tombstone by directly inspecting the contract:
    // since we set expiresAt in the past, the in-memory `isRevoked`
    // check will find a tombstone with `exp < Date.now()` and drop it.
    expect(await isRevoked('jti-stale')).toBe(false);
  });

  it('isolates sessions by institutionId — same nameId across tenants stays separate', async () => {
    await recordSession(baseRec({ jti: 'jti-1', institutionId: 'inst-1', samlNameId: 'shared@example.com' }));
    await recordSession(baseRec({ jti: 'jti-2', institutionId: 'inst-2', samlNameId: 'shared@example.com' }));
    const n = await revokeBySamlSubject('inst-1', 'shared@example.com');
    expect(n).toBe(1);
    expect(await isRevoked('jti-1')).toBe(true);
    expect(await isRevoked('jti-2')).toBe(false);
  });
});
