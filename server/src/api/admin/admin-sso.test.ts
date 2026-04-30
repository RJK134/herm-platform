import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    ssoIdentityProvider: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock('../../utils/prisma', () => ({ default: prismaMock }));

import adminRouter from './admin.router';
import { errorHandler } from '../../middleware/errorHandler';
import { requestId } from '../../middleware/requestId';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'test-jwt-secret-do-not-use-in-prod';

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  app.use(errorHandler);
  return app;
}

function makeToken(opts: { role?: string; institutionId?: string } = {}) {
  return jwt.sign(
    {
      userId: 'u1',
      email: 'admin@uni.test',
      name: 'Admin',
      role: opts.role ?? 'INSTITUTION_ADMIN',
      institutionId: opts.institutionId ?? 'inst-1',
      institutionName: 'University One',
      tier: 'enterprise',
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

const baseRow = {
  id: 'idp-1',
  institutionId: 'inst-1',
  protocol: 'OIDC' as const,
  displayName: 'Sign in with Azure',
  enabled: false,
  jitProvisioning: true,
  defaultRole: 'VIEWER' as const,
  samlEntityId: null,
  samlSsoUrl: null,
  samlCert: null,
  oidcIssuer: 'https://login.microsoftonline.com/tenant',
  oidcClientId: 'client-abc',
  oidcClientSecret: 'plaintext-pre-encryption',
  createdAt: new Date('2026-04-01T00:00:00Z'),
  updatedAt: new Date('2026-04-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('GET /api/admin/sso/me', () => {
  it('returns 401 without a token', async () => {
    const res = await request(buildApp()).get('/api/admin/sso/me');
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin role', async () => {
    const res = await request(buildApp())
      .get('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken({ role: 'VIEWER' })}`);
    expect(res.status).toBe(403);
  });

  it('returns null when no IdP row exists', async () => {
    prismaMock.ssoIdentityProvider.findUnique.mockResolvedValue(null);
    const res = await request(buildApp())
      .get('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null });
  });

  it('returns the IdP row WITHOUT secrets and with hasX flags', async () => {
    prismaMock.ssoIdentityProvider.findUnique.mockResolvedValue(baseRow);
    const res = await request(buildApp())
      .get('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.oidcClientId).toBe('client-abc');
    expect(res.body.data.hasOidcClientSecret).toBe(true);
    expect(res.body.data.hasSamlCert).toBe(false);
    // Sensitive fields must not appear in the read shape.
    expect(res.body.data.oidcClientSecret).toBeUndefined();
    expect(res.body.data.samlCert).toBeUndefined();
  });
});

describe('PUT /api/admin/sso/me', () => {
  it('rejects creation without protocol + displayName', async () => {
    prismaMock.ssoIdentityProvider.findUnique.mockResolvedValue(null);
    const res = await request(buildApp())
      .put('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ enabled: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates a new OIDC IdP and audits the create', async () => {
    // The encrypt-on-write helper refuses plaintext when SSO_SECRET_KEY
    // is unset; that is part of PR #63's contract. Provide a deterministic
    // test key so the create path works end-to-end.
    const originalKey = process.env['SSO_SECRET_KEY'];
    process.env['SSO_SECRET_KEY'] = '42'.repeat(32);
    const { _resetCipherKeyCache } = await import('../../lib/secret-cipher');
    _resetCipherKeyCache();
    try {
      prismaMock.ssoIdentityProvider.findUnique.mockResolvedValue(null);
      prismaMock.ssoIdentityProvider.upsert.mockResolvedValue({
        ...baseRow,
        enabled: true,
      });
      const res = await request(buildApp())
        .put('/api/admin/sso/me')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({
          protocol: 'OIDC',
          displayName: 'Sign in with Azure',
          enabled: true,
          oidcIssuer: 'https://login.microsoftonline.com/tenant',
          oidcClientId: 'client-abc',
          oidcClientSecret: 'super-secret',
        });
      expect(res.status).toBe(200);
      expect(res.body.data.enabled).toBe(true);
      expect(res.body.data.oidcClientSecret).toBeUndefined();
      expect(res.body.data.hasOidcClientSecret).toBe(true);
      expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
      const [createCall] = prismaMock.auditLog.create.mock.calls;
      const auditData = (createCall as unknown as [{ data: { action: string } }])[0].data;
      expect(auditData.action).toBe('admin.sso.create');
    } finally {
      if (originalKey === undefined) delete process.env['SSO_SECRET_KEY'];
      else process.env['SSO_SECRET_KEY'] = originalKey;
      _resetCipherKeyCache();
    }
  });

  it('preserves existing samlCert when the field is omitted on update', async () => {
    prismaMock.ssoIdentityProvider.findUnique.mockResolvedValue({ ...baseRow, samlCert: 'old-cert' });
    prismaMock.ssoIdentityProvider.upsert.mockResolvedValue({ ...baseRow, samlCert: 'old-cert' });
    await request(buildApp())
      .put('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ enabled: true });
    const upsertArgs = prismaMock.ssoIdentityProvider.upsert.mock.calls[0]?.[0] as
      | { update: Record<string, unknown> }
      | undefined;
    expect(upsertArgs?.update).toBeDefined();
    expect('samlCert' in (upsertArgs?.update ?? {})).toBe(false);
  });

  it('clears samlCert when the field is sent as null', async () => {
    prismaMock.ssoIdentityProvider.findUnique.mockResolvedValue({ ...baseRow, samlCert: 'old-cert' });
    prismaMock.ssoIdentityProvider.upsert.mockResolvedValue({ ...baseRow, samlCert: null });
    await request(buildApp())
      .put('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ samlCert: null });
    const upsertArgs = prismaMock.ssoIdentityProvider.upsert.mock.calls[0]?.[0] as
      | { update: Record<string, unknown> }
      | undefined;
    expect(upsertArgs?.update.samlCert).toBeNull();
  });

  it('encrypts a provided oidcClientSecret on the way to Prisma when SSO_SECRET_KEY is set', async () => {
    const originalKey = process.env['SSO_SECRET_KEY'];
    process.env['SSO_SECRET_KEY'] = '42'.repeat(32);
    const { _resetCipherKeyCache } = await import('../../lib/secret-cipher');
    _resetCipherKeyCache();
    try {
      prismaMock.ssoIdentityProvider.findUnique.mockResolvedValue(baseRow);
      prismaMock.ssoIdentityProvider.upsert.mockResolvedValue({ ...baseRow });
      await request(buildApp())
        .put('/api/admin/sso/me')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ oidcClientSecret: 'fresh-secret' });
      const upsertArgs = prismaMock.ssoIdentityProvider.upsert.mock.calls[0]?.[0] as
        | { update: { oidcClientSecret?: string } }
        | undefined;
      const persisted = upsertArgs?.update.oidcClientSecret as string | undefined;
      expect(persisted).toBeDefined();
      expect(persisted).not.toBe('fresh-secret');
      expect(persisted?.startsWith('enc:v1:')).toBe(true);
    } finally {
      if (originalKey === undefined) delete process.env['SSO_SECRET_KEY'];
      else process.env['SSO_SECRET_KEY'] = originalKey;
      _resetCipherKeyCache();
    }
  });
});

describe('DELETE /api/admin/sso/me', () => {
  it('returns 404 when no row exists', async () => {
    prismaMock.ssoIdentityProvider.findUnique.mockResolvedValue(null);
    const res = await request(buildApp())
      .delete('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });

  it('deletes the row and audits', async () => {
    prismaMock.ssoIdentityProvider.findUnique.mockResolvedValue(baseRow);
    prismaMock.ssoIdentityProvider.delete.mockResolvedValue(baseRow);
    const res = await request(buildApp())
      .delete('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(204);
    expect(prismaMock.ssoIdentityProvider.delete).toHaveBeenCalledWith({
      where: { institutionId: 'inst-1' },
    });
    const [createCall] = prismaMock.auditLog.create.mock.calls;
    const auditData = (createCall as unknown as [{ data: { action: string } }])[0].data;
    expect(auditData.action).toBe('admin.sso.delete');
  });
});
