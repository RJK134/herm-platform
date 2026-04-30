/**
 * Phase 10.8 — GDPR data-subject rights.
 *
 * Pins:
 *   - /api/me/data-export returns a bundle of every personal-data
 *     row tied to the calling user, excludes other users' data,
 *     omits the password hash, audit-logs the request.
 *   - /api/me/erase deletes the User row, retains audit log,
 *     refuses to orphan an institution by erasing its only admin,
 *     audit-logs BEFORE the delete so the row references the soon-to-
 *     vanish userId.
 *   - Both endpoints require authentication.
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
    user: {
      findUnique: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
      // Phase 11.9 — erasure now soft-deletes (update + scrub) and
      // wipes notifications via deleteMany. Tests stub both.
      update: vi.fn(),
    },
    notification: { findMany: vi.fn(), deleteMany: vi.fn(async () => ({ count: 0 })) },
    evaluationMember: { findMany: vi.fn() },
    evaluationDomainAssignment: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn(), create: vi.fn(async () => ({})) },
  },
}));
vi.mock('../utils/prisma', () => ({ default: prismaMock }));

import gdprRouter from '../api/gdpr/gdpr.router';

const SECRET = process.env['JWT_SECRET'] ?? 'test-jwt-secret-do-not-use-in-prod';

interface TokenInput {
  userId: string;
  role?: string;
  email?: string;
  institutionId?: string;
}

function tokenFor(t: TokenInput): string {
  return jwt.sign(
    {
      userId: t.userId,
      email: t.email ?? `${t.userId}@example.test`,
      name: t.userId,
      role: t.role ?? 'VIEWER',
      institutionId: t.institutionId ?? 'inst-1',
      institutionName: 'inst-1',
      tier: 'enterprise',
    },
    SECRET,
  );
}

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/me', gdprRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) so leftover mockResolvedValueOnce
  // queued in one test doesn't bleed into the next when the code path
  // didn't consume it. Re-establish the audit no-op default after the
  // reset so audit() never throws and accidentally short-circuits.
  vi.resetAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('GET /api/me/data-export', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(buildApp()).get('/api/me/data-export');
    expect(res.status).toBe(401);
  });

  it('returns a bundle of every personal-data relation, attribution-tagged', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u-me',
      email: 'me@inst.test',
      name: 'Me',
      role: 'INSTITUTION_ADMIN',
      institutionId: 'inst-1',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-04-01'),
    });
    prismaMock.notification.findMany.mockResolvedValueOnce([
      { id: 'n1', userId: 'u-me', title: 'Hello', isRead: false },
    ]);
    prismaMock.evaluationMember.findMany.mockResolvedValueOnce([
      { id: 'em1', userId: 'u-me', projectId: 'p1' },
    ]);
    prismaMock.evaluationDomainAssignment.findMany.mockResolvedValueOnce([
      { id: 'da1', assignedToId: 'u-me' },
    ]);
    prismaMock.auditLog.findMany.mockResolvedValueOnce([
      { id: 'a1', userId: 'u-me', action: 'auth.login.success' },
    ]);

    const res = await request(buildApp())
      .get('/api/me/data-export')
      .set('Authorization', `Bearer ${tokenFor({ userId: 'u-me', role: 'INSTITUTION_ADMIN' })}`);

    expect(res.status).toBe(200);
    expect(res.body.data.subject).toEqual({ userId: 'u-me' });
    expect(res.body.data.profile.email).toBe('me@inst.test');
    expect(res.body.data.profile.passwordHash).toBeUndefined();
    expect(res.body.data.notifications).toHaveLength(1);
    expect(res.body.data.evaluationMemberships).toHaveLength(1);
    expect(res.body.data.domainAssignments).toHaveLength(1);
    expect(res.body.data.auditTrail).toHaveLength(1);
    expect(res.body.data.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="herm-data-export-u-me\.json"/);
  });

  it('filters every Prisma read by the caller userId — never returns another user\'s data', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u-me' });
    prismaMock.notification.findMany.mockResolvedValueOnce([]);
    prismaMock.evaluationMember.findMany.mockResolvedValueOnce([]);
    prismaMock.evaluationDomainAssignment.findMany.mockResolvedValueOnce([]);
    prismaMock.auditLog.findMany.mockResolvedValueOnce([]);

    await request(buildApp())
      .get('/api/me/data-export')
      .set('Authorization', `Bearer ${tokenFor({ userId: 'u-me' })}`);

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u-me' } }),
    );
    expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u-me' } }),
    );
    expect(prismaMock.evaluationMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u-me' } }),
    );
    expect(prismaMock.evaluationDomainAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { assignedToId: 'u-me' } }),
    );
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u-me' } }),
    );
  });

  it('emits a gdpr.dsar.requested audit row with the caller userId', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u-me' });
    prismaMock.notification.findMany.mockResolvedValueOnce([{ id: 'n1' }, { id: 'n2' }]);
    prismaMock.evaluationMember.findMany.mockResolvedValueOnce([]);
    prismaMock.evaluationDomainAssignment.findMany.mockResolvedValueOnce([]);
    prismaMock.auditLog.findMany.mockResolvedValueOnce([]);

    await request(buildApp())
      .get('/api/me/data-export')
      .set('Authorization', `Bearer ${tokenFor({ userId: 'u-me' })}`);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'gdpr.dsar.requested',
          entityType: 'User',
          entityId: 'u-me',
          userId: 'u-me',
          changes: expect.objectContaining({ notificationCount: 2 }),
        }),
      }),
    );
  });
});

describe('POST /api/me/erase', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(buildApp()).post('/api/me/erase');
    expect(res.status).toBe(401);
  });

  it('soft-deletes the User row, scrubs PII, and reports erasure', async () => {
    prismaMock.user.count.mockResolvedValueOnce(1); // not the only admin
    prismaMock.user.update.mockResolvedValueOnce({ id: 'u-me' });

    const res = await request(buildApp())
      .post('/api/me/erase')
      .set('Authorization', `Bearer ${tokenFor({ userId: 'u-me', role: 'VIEWER' })}`);

    expect(res.status).toBe(200);
    expect(res.body.data.erased).toBe(true);
    expect(res.body.data.userId).toBe('u-me');
    // Phase 11.9 — erasure is now an update + PII scrub. The row stays
    // for the retention window; the scheduler hard-deletes later.
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
    const updateArgs = prismaMock.user.update.mock.calls[0]?.[0] as
      | { where: { id: string }; data: Record<string, unknown> }
      | undefined;
    expect(updateArgs?.where).toEqual({ id: 'u-me' });
    expect(updateArgs?.data.deletedAt).toBeInstanceOf(Date);
    expect(updateArgs?.data.email).toBe('deleted+u-me@deleted.invalid');
    expect(updateArgs?.data.name).toBe('[deleted user]');
    expect(updateArgs?.data.passwordHash).toBe('');
    expect(updateArgs?.data.passwordLoginDisabled).toBe(true);
    expect(updateArgs?.data.mfaSecret).toBeNull();
    // Notifications wiped in the same erasure flow.
    expect(prismaMock.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-me' } });
    // The legacy hard-delete path is no longer used.
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it('refuses to erase the only remaining INSTITUTION_ADMIN with 409', async () => {
    prismaMock.user.count.mockResolvedValueOnce(0);
    const res = await request(buildApp())
      .post('/api/me/erase')
      .set('Authorization', `Bearer ${tokenFor({ userId: 'u-admin', role: 'INSTITUTION_ADMIN' })}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GDPR_ERASURE_CONFLICT');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it('lets a non-only INSTITUTION_ADMIN proceed', async () => {
    prismaMock.user.count.mockResolvedValueOnce(2);
    prismaMock.user.update.mockResolvedValueOnce({ id: 'u-admin' });
    const res = await request(buildApp())
      .post('/api/me/erase')
      .set('Authorization', `Bearer ${tokenFor({ userId: 'u-admin', role: 'INSTITUTION_ADMIN' })}`);
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalled();
    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: { institutionId: 'inst-1', role: 'INSTITUTION_ADMIN', id: { not: 'u-admin' } },
    });
  });

  it('audit-logs gdpr.erasure.completed BEFORE soft-deleting the User (so the row references the soon-tombstoned id)', async () => {
    prismaMock.user.count.mockResolvedValueOnce(1);
    const callOrder: string[] = [];
    (prismaMock.auditLog.create as unknown as { mockImplementationOnce: (fn: (arg: unknown) => Promise<unknown>) => unknown })
      .mockImplementationOnce(async () => {
        callOrder.push('audit');
        return {};
      });
    (prismaMock.user.update as unknown as { mockImplementationOnce: (fn: (arg: unknown) => Promise<unknown>) => unknown })
      .mockImplementationOnce(async () => {
        callOrder.push('soft-delete');
        return {};
      });

    await request(buildApp())
      .post('/api/me/erase')
      .set('Authorization', `Bearer ${tokenFor({ userId: 'u-me', role: 'VIEWER' })}`);

    expect(callOrder).toEqual(['audit', 'soft-delete']);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'gdpr.erasure.completed',
          entityType: 'User',
          entityId: 'u-me',
          userId: 'u-me',
        }),
      }),
    );
  });
});
