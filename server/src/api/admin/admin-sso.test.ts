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
      // Phase 11.13 — admin code now uses findFirst (since institutionId
      // is no longer @unique on SsoIdentityProvider) and split upsert into
      // update / create. findUnique is kept for the legacy mocks below.
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    institution: {
      findUnique: vi.fn(),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock('../../utils/prisma', () => ({ default: prismaMock }));

// Phase 11.15 — assert the admin upsert/delete path drives the OIDC
// config-cache invalidation hook. Mock the whole `../sso/oidc` module so
// the integration test pins which {issuer, clientId} keys the controller
// invalidates and in what order — without dragging the real openid-client
// into scope. Other exports from the module aren't used by the controller,
// so we don't need to thread `importActual` through.
const { invalidateMock } = vi.hoisted(() => ({
  invalidateMock: vi.fn(() => true),
}));
vi.mock('../sso/oidc', () => ({
  invalidateOidcConfigCacheByKey: invalidateMock,
}));

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
  invalidateMock.mockReturnValue(true);
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
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(null);
    const res = await request(buildApp())
      .get('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null });
  });

  it('returns the IdP row WITHOUT secrets and with hasX flags', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(baseRow);
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
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(null);
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
      prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(null);
      // Phase 11.13 — admin code split upsert into update / create.
      // findFirst returning null → create path fires.
      prismaMock.ssoIdentityProvider.create.mockResolvedValue({
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
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue({
      ...baseRow,
      samlCert: 'old-cert',
    });
    prismaMock.ssoIdentityProvider.update.mockResolvedValue({ ...baseRow, samlCert: 'old-cert' });
    await request(buildApp())
      .put('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ enabled: true });
    const updateArgs = prismaMock.ssoIdentityProvider.update.mock.calls[0]?.[0] as
      | { data: Record<string, unknown> }
      | undefined;
    expect(updateArgs?.data).toBeDefined();
    expect('samlCert' in (updateArgs?.data ?? {})).toBe(false);
  });

  it('clears samlCert when the field is sent as null', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue({
      ...baseRow,
      samlCert: 'old-cert',
    });
    prismaMock.ssoIdentityProvider.update.mockResolvedValue({ ...baseRow, samlCert: null });
    await request(buildApp())
      .put('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ samlCert: null });
    const updateArgs = prismaMock.ssoIdentityProvider.update.mock.calls[0]?.[0] as
      | { data: Record<string, unknown> }
      | undefined;
    expect(updateArgs?.data.samlCert).toBeNull();
  });

  it('encrypts a provided oidcClientSecret on the way to Prisma when SSO_SECRET_KEY is set', async () => {
    const originalKey = process.env['SSO_SECRET_KEY'];
    process.env['SSO_SECRET_KEY'] = '42'.repeat(32);
    const { _resetCipherKeyCache } = await import('../../lib/secret-cipher');
    _resetCipherKeyCache();
    try {
      prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(baseRow);
      prismaMock.ssoIdentityProvider.update.mockResolvedValue({ ...baseRow });
      await request(buildApp())
        .put('/api/admin/sso/me')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ oidcClientSecret: 'fresh-secret' });
      const updateArgs = prismaMock.ssoIdentityProvider.update.mock.calls[0]?.[0] as
        | { data: { oidcClientSecret?: string } }
        | undefined;
      const persisted = updateArgs?.data.oidcClientSecret as string | undefined;
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
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(null);
    const res = await request(buildApp())
      .delete('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });

  it('deletes the row and audits', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(baseRow);
    prismaMock.ssoIdentityProvider.delete.mockResolvedValue(baseRow);
    const res = await request(buildApp())
      .delete('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(204);
    // Phase 11.13 — delete by row id, not institutionId.
    expect(prismaMock.ssoIdentityProvider.delete).toHaveBeenCalledWith({
      where: { id: 'idp-1' },
    });
    const [createCall] = prismaMock.auditLog.create.mock.calls;
    const auditData = (createCall as unknown as [{ data: { action: string } }])[0].data;
    expect(auditData.action).toBe('admin.sso.delete');
  });
});

// ── Phase 11.8 — SUPER_ADMIN cross-institution panel ───────────────────────

describe('GET /api/admin/sso/all', () => {
  it('rejects INSTITUTION_ADMIN with 403 (SUPER_ADMIN-only)', async () => {
    const res = await request(buildApp())
      .get('/api/admin/sso/all')
      .set('Authorization', `Bearer ${makeToken({ role: 'INSTITUTION_ADMIN' })}`);
    expect(res.status).toBe(403);
  });

  it('returns every IdP with institution name + slug for SUPER_ADMIN', async () => {
    prismaMock.ssoIdentityProvider.findMany.mockResolvedValue([
      {
        ...baseRow,
        institution: { name: 'University One', slug: 'uni-1' },
      },
      {
        ...baseRow,
        id: 'idp-2',
        institutionId: 'inst-2',
        institution: { name: 'College Two', slug: 'college-two' },
      },
    ]);
    const res = await request(buildApp())
      .get('/api/admin/sso/all')
      .set('Authorization', `Bearer ${makeToken({ role: 'SUPER_ADMIN' })}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].institutionName).toBe('University One');
    expect(res.body.data[1].institutionSlug).toBe('college-two');
    // Sensitive fields still suppressed in the list shape.
    expect(res.body.data[0].oidcClientSecret).toBeUndefined();
    expect(res.body.data[0].samlCert).toBeUndefined();
  });
});

describe('GET /api/admin/sso/institutions/:id', () => {
  it('rejects INSTITUTION_ADMIN with 403', async () => {
    const res = await request(buildApp())
      .get('/api/admin/sso/institutions/inst-2')
      .set('Authorization', `Bearer ${makeToken({ role: 'INSTITUTION_ADMIN' })}`);
    expect(res.status).toBe(403);
  });

  it('returns null when the IdP row does not exist', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(null);
    const res = await request(buildApp())
      .get('/api/admin/sso/institutions/inst-empty')
      .set('Authorization', `Bearer ${makeToken({ role: 'SUPER_ADMIN' })}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null });
  });

  it('returns the IdP with institution metadata when it exists', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue({
      ...baseRow,
      institution: { name: 'College Two', slug: 'college-two' },
    });
    const res = await request(buildApp())
      .get('/api/admin/sso/institutions/inst-1')
      .set('Authorization', `Bearer ${makeToken({ role: 'SUPER_ADMIN' })}`);
    expect(res.status).toBe(200);
    expect(res.body.data.institutionName).toBe('College Two');
    expect(res.body.data.hasOidcClientSecret).toBe(true);
    expect(res.body.data.oidcClientSecret).toBeUndefined();
  });
});

describe('PUT /api/admin/sso/institutions/:id', () => {
  it('rejects INSTITUTION_ADMIN with 403', async () => {
    const res = await request(buildApp())
      .put('/api/admin/sso/institutions/inst-2')
      .set('Authorization', `Bearer ${makeToken({ role: 'INSTITUTION_ADMIN' })}`)
      .send({ enabled: true });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the institution does not exist (no orphan rows)', async () => {
    prismaMock.institution.findUnique.mockResolvedValue(null);
    const res = await request(buildApp())
      .put('/api/admin/sso/institutions/inst-typo')
      .set('Authorization', `Bearer ${makeToken({ role: 'SUPER_ADMIN' })}`)
      .send({
        protocol: 'OIDC',
        displayName: 'X',
      });
    expect(res.status).toBe(404);
    // Phase 11.13 — upsert was split; neither create nor update should fire.
    expect(prismaMock.ssoIdentityProvider.create).not.toHaveBeenCalled();
    expect(prismaMock.ssoIdentityProvider.update).not.toHaveBeenCalled();
  });

  it('creates an IdP for any institution as SUPER_ADMIN and audits', async () => {
    const originalKey = process.env['SSO_SECRET_KEY'];
    process.env['SSO_SECRET_KEY'] = '42'.repeat(32);
    const { _resetCipherKeyCache } = await import('../../lib/secret-cipher');
    _resetCipherKeyCache();
    try {
      prismaMock.institution.findUnique.mockResolvedValue({
        id: 'inst-2',
        name: 'College Two',
        slug: 'college-two',
      });
      prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(null);
      // Phase 11.13 — findFirst returning null means create fires.
      prismaMock.ssoIdentityProvider.create.mockResolvedValue({
        ...baseRow,
        institutionId: 'inst-2',
        enabled: true,
      });
      const res = await request(buildApp())
        .put('/api/admin/sso/institutions/inst-2')
        .set('Authorization', `Bearer ${makeToken({ role: 'SUPER_ADMIN' })}`)
        .send({
          protocol: 'OIDC',
          displayName: 'Sign in with Azure',
          enabled: true,
          oidcIssuer: 'https://login.microsoftonline.com/tenant-2',
          oidcClientId: 'client-2',
          oidcClientSecret: 'super-secret-2',
        });
      expect(res.status).toBe(200);
      // Create was scoped to the path institutionId, not the caller's.
      const createArgs = prismaMock.ssoIdentityProvider.create.mock.calls[0]?.[0] as
        | { data: { institutionId: string } }
        | undefined;
      expect(createArgs?.data.institutionId).toBe('inst-2');
      const [createCall] = prismaMock.auditLog.create.mock.calls;
      const auditData = (
        createCall as unknown as [{ data: { action: string; changes: { institutionId: string } } }]
      )[0].data;
      expect(auditData.action).toBe('admin.sso.create');
      expect(auditData.changes.institutionId).toBe('inst-2');
      // Response shape pin (Copilot review feedback): the SUPER_ADMIN
      // upsert response must be the enriched IdpListEntry — institution
      // metadata included, hasX flags surfaced, sensitive fields still
      // suppressed. Otherwise the edit page would lose institutionName
      // after every save.
      expect(res.body.data.institutionName).toBe('College Two');
      expect(res.body.data.institutionSlug).toBe('college-two');
      expect(res.body.data.hasOidcClientSecret).toBe(true);
      expect(res.body.data.oidcClientSecret).toBeUndefined();
      expect(res.body.data.samlCert).toBeUndefined();
    } finally {
      if (originalKey === undefined) delete process.env['SSO_SECRET_KEY'];
      else process.env['SSO_SECRET_KEY'] = originalKey;
      _resetCipherKeyCache();
    }
  });
});

describe('DELETE /api/admin/sso/institutions/:id', () => {
  it('rejects INSTITUTION_ADMIN with 403', async () => {
    const res = await request(buildApp())
      .delete('/api/admin/sso/institutions/inst-2')
      .set('Authorization', `Bearer ${makeToken({ role: 'INSTITUTION_ADMIN' })}`);
    expect(res.status).toBe(403);
  });

  it("deletes another institution's IdP as SUPER_ADMIN", async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue({
      ...baseRow,
      institutionId: 'inst-2',
    });
    prismaMock.ssoIdentityProvider.delete.mockResolvedValue({
      ...baseRow,
      institutionId: 'inst-2',
    });
    const res = await request(buildApp())
      .delete('/api/admin/sso/institutions/inst-2')
      .set('Authorization', `Bearer ${makeToken({ role: 'SUPER_ADMIN' })}`);
    expect(res.status).toBe(204);
    // Phase 11.13 — delete by row id, not institutionId.
    expect(prismaMock.ssoIdentityProvider.delete).toHaveBeenCalledWith({
      where: { id: 'idp-1' },
    });
  });
});

// ── Phase 11.15 — OIDC config cache invalidation on admin upsert/delete ────
//
// The admin SSO write path mutates the row that produces the cached
// `Configuration`'s {clientId, clientSecret}. Without these calls, a secret
// rotation done via the panel takes up to TTL_MS (1h) to take effect — every
// token-exchange in that window 401s at the IdP and surfaces as the opaque
// `sso_failed` banner. Pin the contract: every OIDC mutation invalidates,
// SAML mutations don't, creates only invalidate the new key, and rotations
// of issuer/clientId invalidate the OLD key (read pre-write) AND the new.
describe('PUT /api/admin/sso/me — OIDC cache invalidation', () => {
  it('invalidates the cache on a secret-only rotation (key unchanged)', async () => {
    const originalKey = process.env['SSO_SECRET_KEY'];
    process.env['SSO_SECRET_KEY'] = '42'.repeat(32);
    const { _resetCipherKeyCache } = await import('../../lib/secret-cipher');
    _resetCipherKeyCache();
    try {
      prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(baseRow);
      prismaMock.ssoIdentityProvider.update.mockResolvedValue(baseRow);

      const res = await request(buildApp())
        .put('/api/admin/sso/me')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ oidcClientSecret: 'rotated-secret' });

      expect(res.status).toBe(200);
      // Both old + new keys invalidated. Issuer + clientId unchanged, so
      // both calls collapse to the same {issuer, clientId} pair — that's
      // expected and harmless (the second delete is a no-op against an
      // empty entry); what matters is at least one fired with the right
      // key, so the next OIDC sign-in re-discovers with the new secret.
      expect(invalidateMock).toHaveBeenCalledWith({
        oidcIssuer: baseRow.oidcIssuer,
        oidcClientId: baseRow.oidcClientId,
      });
      expect(invalidateMock).toHaveBeenCalledTimes(2);
    } finally {
      if (originalKey === undefined) delete process.env['SSO_SECRET_KEY'];
      else process.env['SSO_SECRET_KEY'] = originalKey;
      _resetCipherKeyCache();
    }
  });

  it('invalidates BOTH old and new keys when oidcClientId rotates', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(baseRow);
    prismaMock.ssoIdentityProvider.update.mockResolvedValue({
      ...baseRow,
      oidcClientId: 'client-NEW',
    });

    await request(buildApp())
      .put('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ oidcClientId: 'client-NEW' });

    // The OLD key (read from `existing` pre-write) must be invalidated
    // first — that's the entry the cache actually has.
    expect(invalidateMock).toHaveBeenCalledTimes(2);
    expect(invalidateMock).toHaveBeenNthCalledWith(1, {
      oidcIssuer: baseRow.oidcIssuer,
      oidcClientId: baseRow.oidcClientId, // 'client-abc'
    });
    expect(invalidateMock).toHaveBeenNthCalledWith(2, {
      oidcIssuer: baseRow.oidcIssuer,
      oidcClientId: 'client-NEW',
    });
  });

  it('invalidates BOTH old and new keys when oidcIssuer rotates', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(baseRow);
    prismaMock.ssoIdentityProvider.update.mockResolvedValue({
      ...baseRow,
      oidcIssuer: 'https://login.microsoftonline.com/tenant-NEW',
    });

    await request(buildApp())
      .put('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ oidcIssuer: 'https://login.microsoftonline.com/tenant-NEW' });

    expect(invalidateMock).toHaveBeenCalledTimes(2);
    expect(invalidateMock).toHaveBeenNthCalledWith(1, {
      oidcIssuer: baseRow.oidcIssuer,
      oidcClientId: baseRow.oidcClientId,
    });
    expect(invalidateMock).toHaveBeenNthCalledWith(2, {
      oidcIssuer: 'https://login.microsoftonline.com/tenant-NEW',
      oidcClientId: baseRow.oidcClientId,
    });
  });

  it('on create (no existing row) only invalidates the NEW key — no old to evict', async () => {
    const originalKey = process.env['SSO_SECRET_KEY'];
    process.env['SSO_SECRET_KEY'] = '42'.repeat(32);
    const { _resetCipherKeyCache } = await import('../../lib/secret-cipher');
    _resetCipherKeyCache();
    try {
      prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(null);
      prismaMock.ssoIdentityProvider.create.mockResolvedValue({
        ...baseRow,
        enabled: true,
      });

      await request(buildApp())
        .put('/api/admin/sso/me')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({
          protocol: 'OIDC',
          displayName: 'Sign in with Azure',
          oidcIssuer: baseRow.oidcIssuer,
          oidcClientId: baseRow.oidcClientId,
          oidcClientSecret: 'fresh-secret',
        });

      // Single invalidation — defensive new-key drop only; no old row to evict.
      expect(invalidateMock).toHaveBeenCalledTimes(1);
      expect(invalidateMock).toHaveBeenCalledWith({
        oidcIssuer: baseRow.oidcIssuer,
        oidcClientId: baseRow.oidcClientId,
      });
    } finally {
      if (originalKey === undefined) delete process.env['SSO_SECRET_KEY'];
      else process.env['SSO_SECRET_KEY'] = originalKey;
      _resetCipherKeyCache();
    }
  });

  it('does NOT call invalidate for a SAML upsert (cache is OIDC-only)', async () => {
    const samlRow = {
      ...baseRow,
      protocol: 'SAML' as const,
      samlEntityId: 'urn:test',
      samlSsoUrl: 'https://idp.test/sso',
      samlCert: 'CERT-OLD',
      oidcIssuer: null,
      oidcClientId: null,
      oidcClientSecret: null,
    };
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(samlRow);
    prismaMock.ssoIdentityProvider.update.mockResolvedValue({ ...samlRow, samlCert: 'CERT-NEW' });

    await request(buildApp())
      .put('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ samlCert: 'CERT-NEW' });

    expect(invalidateMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/sso/me — OIDC cache invalidation', () => {
  it('invalidates the cache for the deleted IdP (OIDC)', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(baseRow);
    prismaMock.ssoIdentityProvider.delete.mockResolvedValue(baseRow);

    const res = await request(buildApp())
      .delete('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(204);

    expect(invalidateMock).toHaveBeenCalledTimes(1);
    expect(invalidateMock).toHaveBeenCalledWith({
      oidcIssuer: baseRow.oidcIssuer,
      oidcClientId: baseRow.oidcClientId,
    });
  });

  it('does NOT call invalidate for a SAML delete (no cache entry to drop)', async () => {
    const samlRow = {
      ...baseRow,
      protocol: 'SAML' as const,
      oidcIssuer: null,
      oidcClientId: null,
      oidcClientSecret: null,
    };
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(samlRow);
    prismaMock.ssoIdentityProvider.delete.mockResolvedValue(samlRow);

    await request(buildApp())
      .delete('/api/admin/sso/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(invalidateMock).not.toHaveBeenCalled();
  });
});
