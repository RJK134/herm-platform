/**
 * Phase 10.8: TOTP MFA — schema, enrol/verify/disable, and the
 * password→challenge→TOTP login flow.
 *
 * Pins the contract:
 *   - Enrol stages a secret on the User row but leaves `mfaEnabledAt` null.
 *   - Verify activates by stamping `mfaEnabledAt`. Re-verifying after that
 *     is rejected with 409 — to rotate the secret the user must `disable`
 *     first (which itself requires a TOTP).
 *   - Disable refuses an invalid TOTP and audits the failure.
 *   - Login with MFA returns `{ requiresMfa, challengeToken }` instead of
 *     a session JWT. The challenge token is purpose-tagged so it cannot
 *     be used to authenticate normal endpoints.
 *   - mfa/login validates the challenge + TOTP and mints a session JWT.
 *   - All four mutating endpoints emit the matching audit row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';

import { errorHandler } from '../middleware/errorHandler';
import { requestId } from '../middleware/requestId';

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../lib/lockout', () => ({
  checkLockout: vi.fn(() => ({ locked: false, retryAfterMs: 0, attemptsRemaining: 5 })),
  recordFailure: vi.fn(() => ({ locked: false, retryAfterMs: 0, attemptsRemaining: 5 })),
  clearFailures: vi.fn(),
  AccountLockedError: class extends Error {
    statusCode = 429;
    constructor(public retryAfterSeconds: number, public newlyEngaged = false) {
      super('locked');
    }
  },
}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock('../utils/prisma', () => ({ default: prismaMock }));

import authRouter from '../api/auth/auth.router';

const SECRET = process.env['JWT_SECRET'] ?? 'test-jwt-secret-do-not-use-in-prod';

function sessionToken(userId: string): string {
  return jwt.sign(
    {
      userId,
      email: `${userId}@example.test`,
      name: userId,
      role: 'INSTITUTION_ADMIN',
      institutionId: 'inst-1',
      institutionName: 'Inst 1',
      tier: 'professional',
    },
    SECRET,
  );
}

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

// ── /mfa/enroll ────────────────────────────────────────────────────────────

describe('POST /api/auth/mfa/enroll', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(buildApp()).post('/api/auth/mfa/enroll');
    expect(res.status).toBe(401);
  });

  it('mints a fresh secret + otpauth URI and stages it on the user row', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      email: 'u@test.com',
      mfaEnabledAt: null,
    });
    prismaMock.user.update.mockResolvedValue({ id: 'u-1' });

    const res = await request(buildApp())
      .post('/api/auth/mfa/enroll')
      .set('Authorization', `Bearer ${sessionToken('u-1')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.secret).toBe('string');
    expect(res.body.data.secret.length).toBeGreaterThan(10);
    expect(res.body.data.otpauthUri).toMatch(/^otpauth:\/\/totp\/.+secret=/);

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: { mfaSecret: res.body.data.secret },
      }),
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'auth.mfa.enroll', userId: 'u-1' }),
      }),
    );
  });

  it('refuses if MFA is already active (409)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      email: 'u@test.com',
      mfaEnabledAt: new Date(),
    });

    const res = await request(buildApp())
      .post('/api/auth/mfa/enroll')
      .set('Authorization', `Bearer ${sessionToken('u-1')}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MFA_ALREADY_ENABLED');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

// ── /mfa/verify ────────────────────────────────────────────────────────────

describe('POST /api/auth/mfa/verify', () => {
  it('rejects a malformed code with 400', async () => {
    const res = await request(buildApp())
      .post('/api/auth/mfa/verify')
      .set('Authorization', `Bearer ${sessionToken('u-1')}`)
      .send({ code: 'abc' });
    expect(res.status).toBe(400);
  });

  it('refuses if no secret is staged', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      mfaSecret: null,
      mfaEnabledAt: null,
    });

    const res = await request(buildApp())
      .post('/api/auth/mfa/verify')
      .set('Authorization', `Bearer ${sessionToken('u-1')}`)
      .send({ code: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MFA_NOT_ENROLLED');
  });

  it('rejects a wrong code, audits the failure, and does NOT activate', async () => {
    const secret = authenticator.generateSecret();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      mfaSecret: secret,
      mfaEnabledAt: null,
    });

    const res = await request(buildApp())
      .post('/api/auth/mfa/verify')
      .set('Authorization', `Bearer ${sessionToken('u-1')}`)
      .send({ code: '000000' });

    // The fixed string '000000' has a vanishingly small probability of
    // happening to be the current TOTP for `secret` — acceptable as a
    // first-line check. The constant-time comparator inside otplib means
    // this still exercises the failure path.
    if (authenticator.verify({ token: '000000', secret })) {
      // unlucky — skip the assertion rather than introduce flakiness
      return;
    }
    expect(res.status).toBe(401);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'auth.mfa.verify.fail' }),
      }),
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('activates MFA on a valid code and stamps mfaEnabledAt', async () => {
    const secret = authenticator.generateSecret();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      mfaSecret: secret,
      mfaEnabledAt: null,
    });
    prismaMock.user.update.mockResolvedValue({ id: 'u-1' });

    const res = await request(buildApp())
      .post('/api/auth/mfa/verify')
      .set('Authorization', `Bearer ${sessionToken('u-1')}`)
      .send({ code: authenticator.generate(secret) });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.enabledAt).toBe('string');
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: expect.objectContaining({ mfaEnabledAt: expect.any(Date) }),
      }),
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'auth.mfa.verify' }),
      }),
    );
  });

  it('refuses re-verification when already enabled (409)', async () => {
    const secret = authenticator.generateSecret();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      mfaSecret: secret,
      mfaEnabledAt: new Date(),
    });

    const res = await request(buildApp())
      .post('/api/auth/mfa/verify')
      .set('Authorization', `Bearer ${sessionToken('u-1')}`)
      .send({ code: authenticator.generate(secret) });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MFA_ALREADY_ENABLED');
  });
});

// ── /mfa/disable ───────────────────────────────────────────────────────────

describe('POST /api/auth/mfa/disable', () => {
  it('refuses if MFA is not currently active', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      mfaSecret: null,
      mfaEnabledAt: null,
    });

    const res = await request(buildApp())
      .post('/api/auth/mfa/disable')
      .set('Authorization', `Bearer ${sessionToken('u-1')}`)
      .send({ code: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MFA_NOT_ENABLED');
  });

  it('refuses an invalid code and audits the failure', async () => {
    const secret = authenticator.generateSecret();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      mfaSecret: secret,
      mfaEnabledAt: new Date(),
    });

    const res = await request(buildApp())
      .post('/api/auth/mfa/disable')
      .set('Authorization', `Bearer ${sessionToken('u-1')}`)
      .send({ code: '000000' });

    if (authenticator.verify({ token: '000000', secret })) return;
    expect(res.status).toBe(401);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'auth.mfa.disable.fail' }),
      }),
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('clears the secret + activation on a valid code', async () => {
    const secret = authenticator.generateSecret();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      mfaSecret: secret,
      mfaEnabledAt: new Date(),
    });
    prismaMock.user.update.mockResolvedValue({ id: 'u-1' });

    const res = await request(buildApp())
      .post('/api/auth/mfa/disable')
      .set('Authorization', `Bearer ${sessionToken('u-1')}`)
      .send({ code: authenticator.generate(secret) });

    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: { mfaSecret: null, mfaEnabledAt: null },
      }),
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'auth.mfa.disable' }),
      }),
    );
  });
});

// ── /mfa/login ─────────────────────────────────────────────────────────────

describe('POST /api/auth/mfa/login', () => {
  it('rejects an invalid challenge token with 401', async () => {
    const res = await request(buildApp())
      .post('/api/auth/mfa/login')
      .send({ challengeToken: 'not-a-token', code: '123456' });
    expect(res.status).toBe(401);
  });

  it('rejects a normal session token used as a challenge with 401', async () => {
    // Session tokens have no `purpose` claim — the verifier rejects them.
    const res = await request(buildApp())
      .post('/api/auth/mfa/login')
      .send({ challengeToken: sessionToken('u-1'), code: '123456' });
    expect(res.status).toBe(401);
  });

  it('mints a session JWT on a valid challenge + TOTP', async () => {
    const secret = authenticator.generateSecret();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      email: 'u@test.com',
      name: 'User One',
      role: 'INSTITUTION_ADMIN',
      institutionId: 'inst-1',
      mfaSecret: secret,
      mfaEnabledAt: new Date(),
      institution: {
        id: 'inst-1',
        name: 'Inst 1',
        subscription: { tier: 'PROFESSIONAL' },
      },
    });

    const challenge = jwt.sign({ purpose: 'mfa_challenge', userId: 'u-1' }, SECRET, {
      expiresIn: 60,
    });

    const res = await request(buildApp())
      .post('/api/auth/mfa/login')
      .send({ challengeToken: challenge, code: authenticator.generate(secret) });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user).toMatchObject({
      userId: 'u-1',
      email: 'u@test.com',
      role: 'INSTITUTION_ADMIN',
      tier: 'professional',
    });

    // The minted token must NOT carry the challenge purpose.
    const decoded = jwt.verify(res.body.data.token, SECRET) as { purpose?: string };
    expect(decoded.purpose).toBeUndefined();

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'auth.login.mfa.success' }),
      }),
    );
  });

  it('refuses if MFA was disabled between password and TOTP steps (409)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      mfaSecret: null,
      mfaEnabledAt: null,
      institution: { subscription: null, name: 'Inst 1' },
    });

    const challenge = jwt.sign({ purpose: 'mfa_challenge', userId: 'u-1' }, SECRET, {
      expiresIn: 60,
    });

    const res = await request(buildApp())
      .post('/api/auth/mfa/login')
      .send({ challengeToken: challenge, code: '123456' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MFA_NOT_ENABLED');
  });

  it('rejects a wrong TOTP and audits the failure', async () => {
    const secret = authenticator.generateSecret();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      email: 'u@test.com',
      name: 'User One',
      role: 'VIEWER',
      institutionId: 'inst-1',
      mfaSecret: secret,
      mfaEnabledAt: new Date(),
      institution: { id: 'inst-1', name: 'Inst 1', subscription: { tier: 'FREE' } },
    });

    const challenge = jwt.sign({ purpose: 'mfa_challenge', userId: 'u-1' }, SECRET, {
      expiresIn: 60,
    });

    const res = await request(buildApp())
      .post('/api/auth/mfa/login')
      .send({ challengeToken: challenge, code: '000000' });

    if (authenticator.verify({ token: '000000', secret })) return;
    expect(res.status).toBe(401);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'auth.login.mfa.fail' }),
      }),
    );
  });
});

// ── Defence in depth: challenge token cannot be used as a session ──────────

describe('challenge token rejected at session-auth boundary', () => {
  it('returns 401 from authenticateJWT when a challenge token is presented', async () => {
    const challenge = jwt.sign({ purpose: 'mfa_challenge', userId: 'u-1' }, SECRET, {
      expiresIn: 60,
    });

    const res = await request(buildApp())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${challenge}`);

    expect(res.status).toBe(401);
  });

  it('optionalJWT does NOT set req.user from a challenge token', async () => {
    // Bugbot-flagged regression: optionalJWT runs at app level for all
    // /api requests (rate-limiter context). Without the `purpose`
    // guard, a valid challenge token would decode and set req.user to
    // a partial object where role / institutionId / tier are undefined,
    // and downstream middleware would silently operate on those.
    //
    // We exercise the named export `optionalAuth` (aliased to
    // `optionalJWT`) through a scratch route that just returns whatever
    // req.user is.
    const { optionalAuth } = await import('../middleware/auth');
    const app = express();
    app.use(requestId);
    app.use(express.json());
    app.get('/scratch', optionalAuth, (req, res) => {
      res.json({ user: req.user ?? null });
    });
    app.use(errorHandler);

    const challenge = jwt.sign({ purpose: 'mfa_challenge', userId: 'u-1' }, SECRET, {
      expiresIn: 60,
    });
    const res = await request(app)
      .get('/scratch')
      .set('Authorization', `Bearer ${challenge}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });
});
