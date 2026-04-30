/**
 * Phase 10.3: Customer-support sudo / impersonation.
 *
 * Pins the contract:
 *   - Only SUPER_ADMIN can issue an impersonation token.
 *   - The token represents the TARGET user (role/tier/institution) so
 *     downstream middleware sees the platform as the customer would.
 *   - An `impersonator` claim is embedded in the token so audit /
 *     banners can attribute every action back to the support engineer.
 *   - Cannot impersonate self, another SUPER_ADMIN, a non-existent
 *     user, or chain impersonations.
 *   - End endpoint mints a fresh 7-day token for the original admin.
 *   - audit() merges `impersonator` into every changes payload while a
 *     session is active — single-query attribution to the SUPER_ADMIN.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { errorHandler } from '../middleware/errorHandler';
import { requestId } from '../middleware/requestId';

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

import adminRouter from '../api/admin/admin.router';
import { audit } from '../lib/audit';

const SECRET = process.env['JWT_SECRET'] ?? 'test-jwt-secret-do-not-use-in-prod';

interface TokenInput {
  userId: string;
  role: string;
  email?: string;
  name?: string;
  institutionId?: string;
  institutionName?: string;
  tier?: string;
  impersonator?: { userId: string; email: string; name: string };
}

function tokenFor(t: TokenInput): string {
  const institutionId = t.institutionId ?? 'inst-1';

  return jwt.sign(
    {
      userId: t.userId,
      email: t.email ?? `${t.userId}@example.test`,
      name: t.name ?? t.userId,
      role: t.role,
      institutionId,
      institutionName: t.institutionName ?? `Inst ${institutionId}`,
      tier: t.tier ?? 'enterprise',
      ...(t.impersonator ? { impersonator: t.impersonator } : {}),
    },
    SECRET,
  );
}

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('POST /api/admin/impersonate — start', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(buildApp()).post('/api/admin/impersonate').send({ userId: 'u-target' });
    expect(res.status).toBe(401);
  });

  it('rejects a non-SUPER_ADMIN with 403', async () => {
    const res = await request(buildApp())
      .post('/api/admin/impersonate')
      .set('Authorization', `Bearer ${tokenFor({ userId: 'u-admin', role: 'INSTITUTION_ADMIN' })}`)
      .send({ userId: 'u-target' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
  });

  it('rejects self-impersonation with 400', async () => {
    const res = await request(buildApp())
      .post('/api/admin/impersonate')
      .set('Authorization', `Bearer ${tokenFor({ userId: 'u-super', role: 'SUPER_ADMIN' })}`)
      .send({ userId: 'u-super' });
    expect(res.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects impersonating a non-existent user with 404', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    const res = await request(buildApp())
      .post('/api/admin/impersonate')
      .set('Authorization', `Bearer ${tokenFor({ userId: 'u-super', role: 'SUPER_ADMIN' })}`)
      .send({ userId: 'u-ghost' });
    expect(res.status).toBe(404);
  });

  it('rejects impersonating another SUPER_ADMIN with 403', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u-super-2',
      email: 's2@example.test',
      name: 's2',
      role: 'SUPER_ADMIN',
      institutionId: 'inst-platform',
      institution: { name: 'Platform', subscription: { tier: 'ENTERPRISE' } },
    });
    const res = await request(buildApp())
      .post('/api/admin/impersonate')
      .set('Authorization', `Bearer ${tokenFor({ userId: 'u-super', role: 'SUPER_ADMIN' })}`)
      .send({ userId: 'u-super-2' });
    expect(res.status).toBe(403);
  });

  it('rejects chained impersonation (token already carries an impersonator claim)', async () => {
    const res = await request(buildApp())
      .post('/api/admin/impersonate')
      .set(
        'Authorization',
        `Bearer ${tokenFor({
          userId: 'u-target',
          role: 'VIEWER',
          impersonator: { userId: 'u-super', email: 's@example.test', name: 's' },
        })}`,
      )
      .send({ userId: 'u-other' });
    // The first guard checks role !== SUPER_ADMIN — a target user is not
    // a SUPER_ADMIN, so we get 403 (the chained check is belt-and-braces
    // for the SUPER_ADMIN-impersonating-SUPER_ADMIN-then-trying-again
    // edge case).
    expect(res.status).toBe(403);
  });

  it('issues a 1-hour token whose payload represents the TARGET + carries the SUPER_ADMIN as impersonator', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u-target',
      email: 'target@cust.test',
      name: 'Target',
      role: 'INSTITUTION_ADMIN',
      institutionId: 'inst-cust',
      institution: { name: 'Customer Co', subscription: { tier: 'PROFESSIONAL' } },
    });
    const res = await request(buildApp())
      .post('/api/admin/impersonate')
      .set(
        'Authorization',
        `Bearer ${tokenFor({ userId: 'u-super', role: 'SUPER_ADMIN', email: 'super@platform.test', name: 'Super Admin' })}`,
      )
      .send({ userId: 'u-target' });

    expect(res.status).toBe(200);
    expect(res.body.data.expiresInSeconds).toBe(3600);
    expect(res.body.data.impersonating).toEqual({
      userId: 'u-target',
      email: 'target@cust.test',
      name: 'Target',
    });

    const decoded = jwt.verify(res.body.data.token, SECRET) as Record<string, unknown> & {
      exp: number;
      iat: number;
      impersonator: { userId: string; email: string; name: string };
    };
    expect(decoded.userId).toBe('u-target');
    expect(decoded.role).toBe('INSTITUTION_ADMIN');
    expect(decoded.institutionId).toBe('inst-cust');
    expect(decoded.tier).toBe('professional');
    expect(decoded.impersonator).toEqual({
      userId: 'u-super',
      email: 'super@platform.test',
      name: 'Super Admin',
    });
    // 1-hour expiry, allow 30 seconds of slack
    expect(decoded.exp - decoded.iat).toBeGreaterThan(3600 - 30);
    expect(decoded.exp - decoded.iat).toBeLessThan(3600 + 30);
  });

  it('writes an admin.impersonate.start audit row with target details', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u-target',
      email: 'target@cust.test',
      name: 'Target',
      role: 'VIEWER',
      institutionId: 'inst-cust',
      institution: { name: 'Customer Co', subscription: { tier: 'FREE' } },
    });
    await request(buildApp())
      .post('/api/admin/impersonate')
      .set('Authorization', `Bearer ${tokenFor({ userId: 'u-super', role: 'SUPER_ADMIN' })}`)
      .send({ userId: 'u-target' });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'admin.impersonate.start',
          entityType: 'User',
          entityId: 'u-target',
          userId: 'u-super',
          changes: expect.objectContaining({
            targetUserId: 'u-target',
            targetEmail: 'target@cust.test',
            targetRole: 'VIEWER',
            targetInstitutionId: 'inst-cust',
          }),
        }),
      }),
    );
  });
});

describe('POST /api/admin/impersonate/end', () => {
  it('rejects a normal session (no impersonator claim) with 400', async () => {
    const res = await request(buildApp())
      .post('/api/admin/impersonate/end')
      .set('Authorization', `Bearer ${tokenFor({ userId: 'u-normal', role: 'VIEWER' })}`);
    expect(res.status).toBe(400);
  });

  it('mints a fresh 7-day token for the original SUPER_ADMIN and audit-logs the end', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u-super',
      email: 'super@platform.test',
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      institutionId: 'inst-platform',
      institution: { name: 'Platform', subscription: { tier: 'ENTERPRISE' } },
    });

    const res = await request(buildApp())
      .post('/api/admin/impersonate/end')
      .set(
        'Authorization',
        `Bearer ${tokenFor({
          userId: 'u-target',
          role: 'INSTITUTION_ADMIN',
          impersonator: { userId: 'u-super', email: 'super@platform.test', name: 'Super Admin' },
        })}`,
      );

    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.data.token, SECRET) as {
      userId: string;
      role: string;
      impersonator?: unknown;
      exp: number;
      iat: number;
    };
    expect(decoded.userId).toBe('u-super');
    expect(decoded.role).toBe('SUPER_ADMIN');
    expect(decoded.impersonator).toBeUndefined();
    // 7-day expiry
    expect(decoded.exp - decoded.iat).toBeGreaterThan(7 * 24 * 3600 - 60);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'admin.impersonate.end',
          userId: 'u-super',
          entityId: 'u-target',
        }),
      }),
    );
  });

  it('returns 404 if the original SUPER_ADMIN was deleted during the session', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    const res = await request(buildApp())
      .post('/api/admin/impersonate/end')
      .set(
        'Authorization',
        `Bearer ${tokenFor({
          userId: 'u-target',
          role: 'INSTITUTION_ADMIN',
          impersonator: { userId: 'u-deleted', email: 'd@x.test', name: 'd' },
        })}`,
      );
    expect(res.status).toBe(404);
  });
});

describe('audit() merges impersonator into every changes payload during a session', () => {
  it('preserves caller-supplied changes AND adds impersonator metadata', async () => {
    const fakeReq = {
      ip: '127.0.0.1',
      user: {
        userId: 'u-target',
        email: 'target@cust.test',
        name: 'Target',
        role: 'VIEWER',
        institutionId: 'inst-cust',
        institutionName: 'Customer Co',
        tier: 'free',
        impersonator: { userId: 'u-super', email: 'super@platform.test', name: 'Super Admin' },
      },
    } as unknown as import('express').Request;

    await audit(fakeReq, {
      action: 'export.csv',
      entityType: 'EvaluationProject',
      entityId: 'proj-1',
      userId: 'u-target',
      changes: { rowCount: 42 },
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'export.csv',
          userId: 'u-target',
          entityId: 'proj-1',
          changes: expect.objectContaining({
            rowCount: 42,
            impersonator: { userId: 'u-super', email: 'super@platform.test' },
          }),
        }),
      }),
    );
  });

  it('does NOT add an impersonator key on a normal session', async () => {
    const fakeReq = {
      ip: '127.0.0.1',
      user: {
        userId: 'u-normal',
        email: 'n@x.test',
        name: 'n',
        role: 'VIEWER',
        institutionId: 'inst-x',
        institutionName: 'inst-x',
        tier: 'free',
      },
    } as unknown as import('express').Request;

    await audit(fakeReq, {
      action: 'export.csv',
      entityType: 'EvaluationProject',
      changes: { rowCount: 1 },
    });

    const calls = prismaMock.auditLog.create.mock.calls as unknown as Array<[{ data: { changes: Record<string, unknown> } }]>;
    const lastCall = calls.at(-1);
    expect(lastCall).toBeDefined();
    expect(lastCall![0].data.changes).toEqual({ rowCount: 1 });
    expect(lastCall![0].data.changes['impersonator']).toBeUndefined();
  });
});
