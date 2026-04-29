/**
 * Audit-coverage regression tests. Asserts that the `audit()` helper is
 * called from each surface that Phase 9 / Workstream H requires logging
 * for — auth, admin, keys, exports, institutions. The tests mock the
 * audit module so we can assert call shape without touching prisma.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { auditMock, prismaMock, authServiceMock, institutionsServiceMock } = vi.hoisted(() => ({
  auditMock: vi.fn().mockResolvedValue(undefined),
  prismaMock: {
    apiKey: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    vendorAccount: {
      update: vi.fn(),
    },
    vendorSubmission: {
      update: vi.fn(),
    },
  },
  authServiceMock: {
    register: vi.fn(),
    login: vi.fn(),
    getMe: vi.fn(),
    updateProfile: vi.fn(),
  },
  institutionsServiceMock: {
    getMyInstitution: vi.fn(),
    updateInstitution: vi.fn(),
    listUsers: vi.fn(),
    updateUserRole: vi.fn(),
  },
}));

vi.mock('../lib/audit', () => ({
  audit: auditMock,
}));
vi.mock('../utils/prisma', () => ({ default: prismaMock }));
vi.mock('../api/auth/auth.service', () => ({
  AuthService: function MockAuthService() {
    return authServiceMock;
  },
}));
vi.mock('../api/institutions/institutions.service', () => ({
  InstitutionsService: function MockInstitutionsService() {
    return institutionsServiceMock;
  },
}));

import authRouter from '../api/auth/auth.router';
import keysRouter from '../api/keys/keys.router';
import adminRouter from '../api/admin/admin.router';
import institutionsRouter from '../api/institutions/institutions.router';

const SECRET = process.env['JWT_SECRET'] ?? 'test-jwt-secret-do-not-use-in-prod';

function tok(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      userId: 'user-1',
      email: 'admin@inst.test',
      name: 'Admin',
      role: 'INSTITUTION_ADMIN',
      institutionId: 'inst-1',
      institutionName: 'Inst',
      tier: 'enterprise',
      ...overrides,
    },
    SECRET,
  );
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/keys', keysRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/institutions', institutionsRouter);
  return app;
}

beforeEach(() => {
  auditMock.mockClear();
  prismaMock.apiKey.create.mockReset();
  prismaMock.apiKey.updateMany.mockReset();
  prismaMock.vendorAccount.update.mockReset();
  prismaMock.vendorSubmission.update.mockReset();
  authServiceMock.register.mockReset();
  authServiceMock.login.mockReset();
  authServiceMock.updateProfile.mockReset();
  institutionsServiceMock.updateUserRole.mockReset();
});

describe('audit coverage — auth', () => {
  it('register writes auth.register audit row', async () => {
    authServiceMock.register.mockResolvedValueOnce({
      token: 't',
      user: { userId: 'u1', email: 'u1@test.example', institutionId: 'i1' },
    });
    await request(buildApp())
      .post('/api/auth/register')
      .send({
        email: 'u1@test.example',
        password: 'pw12345678',
        name: 'User One',
        institutionName: 'Institution One',
      });
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'auth.register',
        entityType: 'User',
        entityId: 'u1',
        userId: 'u1',
      }),
    );
  });

  it('successful login writes auth.login.success audit row', async () => {
    authServiceMock.login.mockResolvedValueOnce({
      token: 't',
      user: { userId: 'u1', email: 'u1@test.example', institutionId: 'i1' },
    });
    await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'u1@test.example', password: 'pw12345678' });
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'auth.login.success', entityId: 'u1' }),
    );
  });

  it('failed login writes auth.login.fail audit row (no password in changes)', async () => {
    const { AppError } = await import('../utils/errors');
    authServiceMock.login.mockRejectedValueOnce(
      new AppError(401, 'AUTHENTICATION_ERROR', 'bad creds'),
    );
    await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'u1@test.example', password: 'wrong-password-12345' });
    const failCall = auditMock.mock.calls.find(
      (c) => (c[1] as { action?: string } | undefined)?.action === 'auth.login.fail',
    );
    expect(failCall).toBeDefined();
    const entry = failCall![1] as { changes?: Record<string, unknown> };
    expect(entry.changes).toEqual({ emailTried: 'u1@test.example' });
    expect(JSON.stringify(entry)).not.toMatch(/wrong-password/);
  });

  it('logout writes auth.logout audit row when authenticated', async () => {
    await request(buildApp())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${tok()}`);
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'auth.logout', entityId: 'user-1' }),
    );
  });

  it('logout is silent when anonymous (no audit row)', async () => {
    await request(buildApp()).post('/api/auth/logout');
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('profile update writes auth.profile.update audit row', async () => {
    authServiceMock.updateProfile.mockResolvedValueOnce({ name: 'New Name' });
    await request(buildApp())
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${tok()}`)
      .send({ name: 'New Name' });
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'auth.profile.update',
        entityId: 'user-1',
        changes: { name: 'New Name' },
      }),
    );
  });
});

describe('audit coverage — keys', () => {
  it('POST /api/keys writes keys.create audit row', async () => {
    prismaMock.apiKey.create.mockResolvedValueOnce({
      id: 'k-1',
      name: 'My key',
      keyPrefix: 'herm_pk_abcd1234',
      permissions: ['read:systems'],
      expiresAt: null,
      createdAt: new Date(),
    });
    await request(buildApp())
      .post('/api/keys')
      .set('Authorization', `Bearer ${tok()}`)
      .send({ name: 'My key', permissions: ['read:systems'] });
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'keys.create',
        entityType: 'ApiKey',
        entityId: 'k-1',
        userId: 'user-1',
      }),
    );
  });

  it('DELETE /api/keys/:id writes keys.revoke audit row', async () => {
    prismaMock.apiKey.updateMany.mockResolvedValueOnce({ count: 1 });
    await request(buildApp())
      .delete('/api/keys/k-1')
      .set('Authorization', `Bearer ${tok()}`);
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'keys.revoke',
        entityType: 'ApiKey',
        entityId: 'k-1',
        userId: 'user-1',
      }),
    );
  });

  it('DELETE /api/keys/:id does NOT audit when count=0 (wrong-owner / not found)', async () => {
    prismaMock.apiKey.updateMany.mockResolvedValueOnce({ count: 0 });
    await request(buildApp())
      .delete('/api/keys/k-other-tenant')
      .set('Authorization', `Bearer ${tok()}`);
    expect(auditMock).not.toHaveBeenCalled();
  });
});

describe('audit coverage — admin', () => {
  it('PATCH /api/admin/vendors/:id writes admin.vendor.update audit row', async () => {
    prismaMock.vendorAccount.update.mockResolvedValueOnce({ id: 'va-1' });
    await request(buildApp())
      .patch('/api/admin/vendors/va-1')
      .set('Authorization', `Bearer ${tok()}`)
      .send({ status: 'approved' });
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'admin.vendor.update',
        entityType: 'VendorAccount',
        entityId: 'va-1',
        userId: 'user-1',
      }),
    );
  });

  it('PATCH /api/admin/submissions/:id writes admin.submission.review audit row', async () => {
    prismaMock.vendorSubmission.update.mockResolvedValueOnce({ id: 'sub-1' });
    await request(buildApp())
      .patch('/api/admin/submissions/sub-1')
      .set('Authorization', `Bearer ${tok()}`)
      .send({ status: 'approved' });
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'admin.submission.review',
        entityType: 'VendorSubmission',
        entityId: 'sub-1',
        userId: 'user-1',
      }),
    );
  });
});

describe('audit coverage — institutions', () => {
  it('PATCH role writes institutions.role.change audit row', async () => {
    institutionsServiceMock.updateUserRole.mockResolvedValueOnce({ id: 'u-target' });
    await request(buildApp())
      .patch('/api/institutions/me/users/u-target/role')
      .set('Authorization', `Bearer ${tok()}`)
      .send({ role: 'PROCUREMENT_LEAD' });
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'institutions.role.change',
        entityType: 'User',
        entityId: 'u-target',
        userId: 'user-1',
        changes: expect.objectContaining({ newRole: 'PROCUREMENT_LEAD' }),
      }),
    );
  });
});
