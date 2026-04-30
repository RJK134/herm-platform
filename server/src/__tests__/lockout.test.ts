/**
 * Phase 10.5: Account lockout — credential-stuffing defence.
 *
 * Pins the policy:
 *   - 5 failures within 15 minutes engages a 30-minute lock.
 *   - Lockout check runs BEFORE bcrypt (cheap O(1) Map lookup).
 *   - Failures for non-existent emails still count, so an attacker
 *     can't probe for valid emails by timing differences.
 *   - Successful login clears the counter.
 *   - While locked, more failures don't extend the timer (DoS resist).
 *   - Email key is case-insensitive + trim-normalised.
 *   - Login controller emits `auth.lockout.engaged` audit event +
 *     Retry-After header on the 429.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock('../utils/prisma', () => ({ default: prismaMock }));

const { bcryptCompare } = vi.hoisted(() => ({ bcryptCompare: vi.fn() }));
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'hashed'), compare: bcryptCompare },
  hash: vi.fn(async () => 'hashed'),
  compare: bcryptCompare,
}));

import {
  checkLockout,
  recordFailure,
  clearFailures,
  __resetLockoutForTests,
  __overrideLockoutClock,
  LOCKOUT_CONFIG,
} from '../lib/lockout';
import { errorHandler } from '../middleware/errorHandler';
import { requestId } from '../middleware/requestId';
import authRouter from '../api/auth/auth.router';

beforeEach(() => {
  __resetLockoutForTests();
  prismaMock.user.findUnique.mockReset();
  prismaMock.auditLog.create.mockReset();
  prismaMock.auditLog.create.mockResolvedValue({});
  bcryptCompare.mockReset();
});

describe('lockout — pure module behaviour', () => {
  it('is open by default for an unseen email', () => {
    const state = checkLockout('a@b.test');
    expect(state.locked).toBe(false);
    expect(state.attemptsRemaining).toBe(LOCKOUT_CONFIG.MAX_FAILS);
  });

  it('engages lockout after MAX_FAILS failures within the window', () => {
    let t = 1_700_000_000_000;
    __overrideLockoutClock(() => t);

    for (let i = 0; i < LOCKOUT_CONFIG.MAX_FAILS - 1; i += 1) {
      const s = recordFailure('a@b.test');
      expect(s.locked).toBe(false);
      t += 1000;
    }
    const final = recordFailure('a@b.test');
    expect(final.locked).toBe(true);
    expect(final.retryAfterMs).toBe(LOCKOUT_CONFIG.LOCK_MS);

    expect(checkLockout('a@b.test').locked).toBe(true);
  });

  it('expires the lock after LOCK_MS and resets the counter', () => {
    let t = 0;
    __overrideLockoutClock(() => t);
    for (let i = 0; i < LOCKOUT_CONFIG.MAX_FAILS; i += 1) {
      recordFailure('a@b.test');
      t += 1000;
    }
    expect(checkLockout('a@b.test').locked).toBe(true);

    // Jump past the lock window.
    t += LOCKOUT_CONFIG.LOCK_MS + 1;
    const state = checkLockout('a@b.test');
    expect(state.locked).toBe(false);
    expect(state.attemptsRemaining).toBe(LOCKOUT_CONFIG.MAX_FAILS);
  });

  it('does NOT extend the lock timer on additional failures while locked', () => {
    let t = 0;
    __overrideLockoutClock(() => t);
    for (let i = 0; i < LOCKOUT_CONFIG.MAX_FAILS; i += 1) {
      recordFailure('a@b.test');
      t += 1000;
    }
    const lockedAt = checkLockout('a@b.test');
    expect(lockedAt.locked).toBe(true);
    const initialRetry = lockedAt.retryAfterMs;

    // Additional failures while locked.
    t += 60_000;
    recordFailure('a@b.test');
    recordFailure('a@b.test');
    const state = checkLockout('a@b.test');
    expect(state.locked).toBe(true);
    // retryAfterMs should have decreased (clock advanced) — proving the
    // lockedUntil ceiling didn't get pushed further out.
    expect(state.retryAfterMs).toBeLessThan(initialRetry);
  });

  it('prunes failures older than WINDOW_MS so isolated attempts never lock', () => {
    let t = 0;
    __overrideLockoutClock(() => t);
    // 4 failures spaced just outside the window — never accumulates to MAX.
    for (let i = 0; i < 10; i += 1) {
      recordFailure('a@b.test');
      t += LOCKOUT_CONFIG.WINDOW_MS + 1000;
    }
    expect(checkLockout('a@b.test').locked).toBe(false);
  });

  it('clearFailures resets the counter on successful login', () => {
    for (let i = 0; i < LOCKOUT_CONFIG.MAX_FAILS - 1; i += 1) {
      recordFailure('a@b.test');
    }
    clearFailures('a@b.test');
    const state = checkLockout('a@b.test');
    expect(state.attemptsRemaining).toBe(LOCKOUT_CONFIG.MAX_FAILS);
  });

  it('treats the email key as case-insensitive + trimmed', () => {
    for (let i = 0; i < LOCKOUT_CONFIG.MAX_FAILS; i += 1) {
      recordFailure('  Mixed.Case@Example.Test  ');
    }
    expect(checkLockout('mixed.case@example.test').locked).toBe(true);
    clearFailures('MIXED.CASE@example.test');
    expect(checkLockout('mixed.case@example.test').locked).toBe(false);
  });
});

function buildAuthApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use(errorHandler);
  return app;
}

describe('login route — lockout integration', () => {
  it('returns 429 + Retry-After header + AUTH_LOCKED code after MAX_FAILS bad passwords', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      email: 'a@b.test',
      name: 'A',
      role: 'VIEWER',
      passwordHash: 'hash',
      institutionId: 'inst-1',
      institution: { id: 'inst-1', name: 'I', subscription: { tier: 'FREE' } },
    });
    bcryptCompare.mockResolvedValue(false);

    const app = buildAuthApp();
    let last: import('supertest').Response | undefined;
    for (let i = 0; i < LOCKOUT_CONFIG.MAX_FAILS; i += 1) {
      last = await request(app).post('/api/auth/login').send({ email: 'a@b.test', password: 'wrong' });
    }
    expect(last).toBeDefined();
    expect(last!.status).toBe(429);
    expect(last!.body.error.code).toBe('AUTH_LOCKED');
    expect(Number(last!.headers['retry-after'])).toBeGreaterThan(0);

    // Subsequent attempts also 429 — even with the right password,
    // because the lock check runs BEFORE bcrypt.
    bcryptCompare.mockResolvedValueOnce(true);
    const next = await request(app).post('/api/auth/login').send({ email: 'a@b.test', password: 'right' });
    expect(next.status).toBe(429);
    expect(bcryptCompare).toHaveBeenCalledTimes(LOCKOUT_CONFIG.MAX_FAILS);
  });

  it('emits auth.lockout.engaged audit event on the lockout boundary', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      email: 'a@b.test',
      name: 'A',
      role: 'VIEWER',
      passwordHash: 'hash',
      institutionId: 'inst-1',
      institution: { id: 'inst-1', name: 'I', subscription: { tier: 'FREE' } },
    });
    bcryptCompare.mockResolvedValue(false);

    const app = buildAuthApp();
    for (let i = 0; i < LOCKOUT_CONFIG.MAX_FAILS; i += 1) {
      await request(app).post('/api/auth/login').send({ email: 'a@b.test', password: 'wrong' });
    }

    const calls = prismaMock.auditLog.create.mock.calls as unknown as Array<[{ data: { action: string; changes?: Record<string, unknown> } }]>;
    const actions = calls.map((c) => c[0].data.action);
    expect(actions).toContain('auth.login.fail');
    expect(actions).toContain('auth.lockout.engaged');
    const lockoutCall = calls.find((c) => c[0].data.action === 'auth.lockout.engaged');
    expect(lockoutCall?.[0].data.changes).toEqual(
      expect.objectContaining({
        emailTried: 'a@b.test',
        retryAfterSeconds: expect.any(Number),
      }),
    );
  });

  it('records failures even for non-existent emails (no email-existence side channel)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const app = buildAuthApp();
    for (let i = 0; i < LOCKOUT_CONFIG.MAX_FAILS; i += 1) {
      await request(app).post('/api/auth/login').send({ email: 'ghost@example.test', password: 'x' });
    }
    expect(checkLockout('ghost@example.test').locked).toBe(true);
  });

  it('successful login clears the failure history', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      email: 'a@b.test',
      name: 'A',
      role: 'VIEWER',
      passwordHash: 'hash',
      institutionId: 'inst-1',
      institution: { id: 'inst-1', name: 'I', subscription: { tier: 'FREE' } },
    });

    const app = buildAuthApp();
    bcryptCompare.mockResolvedValueOnce(false);
    bcryptCompare.mockResolvedValueOnce(false);
    await request(app).post('/api/auth/login').send({ email: 'a@b.test', password: 'wrong' });
    await request(app).post('/api/auth/login').send({ email: 'a@b.test', password: 'wrong' });

    bcryptCompare.mockResolvedValueOnce(true);
    const ok = await request(app).post('/api/auth/login').send({ email: 'a@b.test', password: 'right' });
    expect(ok.status).toBe(200);

    const state = checkLockout('a@b.test');
    expect(state.attemptsRemaining).toBe(LOCKOUT_CONFIG.MAX_FAILS);
  });
});
