/**
 * Integration: tier-control invariants.
 *
 * Exercises the real routers + middleware stack with a mocked Prisma so we
 * can assert FREE / PROFESSIONAL / ENTERPRISE behaviour deterministically:
 *   - FREE can read HERM (`/api/capabilities` against a public framework)
 *   - FREE is blocked from PROFESSIONAL surfaces (sanity: enterprise-only
 *     `/api/framework-mappings` rejects free)
 *   - PROFESSIONAL is blocked from ENTERPRISE-only surfaces
 *     (`/api/framework-mappings` and `/api/keys` enforce enterprise)
 *   - ENTERPRISE passes the enterprise gate
 *
 * Source of truth for the matrix: HERM_COMPLIANCE.md "Tier classification of
 * API routes" + ARCHITECTURE_NOTES.md "Route auth matrix".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { errorHandler } from '../middleware/errorHandler';
import { requestId } from '../middleware/requestId';

vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { prismaMock, capabilitiesServiceMock, frameworkMappingsServiceMock } = vi.hoisted(() => ({
  prismaMock: {
    framework: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    apiKey: {
      findMany: vi.fn(),
    },
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  capabilitiesServiceMock: {
    listCapabilities: vi.fn(),
    getCapabilityByCode: vi.fn(),
    listDomains: vi.fn(),
  },
  frameworkMappingsServiceMock: {
    list: vi.fn(),
    getById: vi.fn(),
    lookup: vi.fn(),
  },
}));
vi.mock('../utils/prisma', () => ({ default: prismaMock }));
vi.mock('../api/capabilities/capabilities.service', () => ({
  CapabilitiesService: function MockCapabilitiesService(this: typeof capabilitiesServiceMock) {
    return capabilitiesServiceMock;
  },
}));
vi.mock('../api/framework-mappings/framework-mappings.service', () => ({
  FrameworkMappingsService: function MockFrameworkMappingsService(this: typeof frameworkMappingsServiceMock) {
    return frameworkMappingsServiceMock;
  },
}));

import capabilitiesRouter from '../api/capabilities/capabilities.router';
import frameworkMappingsRouter from '../api/framework-mappings/framework-mappings.router';
import keysRouter from '../api/keys/keys.router';
import notificationsRouter from '../api/notifications/notifications.router';
import { frameworkContext } from '../middleware/framework-context';
import { tierGate } from '../middleware/tier-gate';
import { optionalJWT } from '../middleware/auth';

const SECRET = process.env['JWT_SECRET'] ?? 'test-jwt-secret-do-not-use-in-prod';

function token(tier: 'free' | 'pro' | 'enterprise', overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      userId: `user-${tier}`,
      email: `${tier}@inst.test`,
      name: `${tier} user`,
      role: 'VIEWER',
      institutionId: `inst-${tier}`,
      institutionName: `Inst ${tier}`,
      tier,
      ...overrides,
    },
    SECRET,
  );
}

const PUBLIC_HERM_FRAMEWORK = {
  id: 'fw-herm',
  slug: 'herm-v3.1',
  name: 'UCISA HERM v3.1',
  isPublic: true,
  isDefault: false,
  isActive: true,
  licenceType: 'CC-BY-NC-SA-4.0',
  publisher: 'CAUDIT',
  licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  licenceNotice: 'UCISA HERM v3.1 © CAUDIT, licensed under CC-BY-NC-SA-4.0',
};

const PRIVATE_FHE_FRAMEWORK = {
  id: 'fw-fhe',
  slug: 'fhe-capability-framework',
  name: 'FHE Capability Framework',
  isPublic: false,
  isDefault: true,
  isActive: true,
  licenceType: 'PROPRIETARY',
  publisher: 'Future Horizons Education',
  licenceUrl: null,
  licenceNotice: null,
};

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  // Match the production middleware stack used in app.ts for these routes.
  const frameworkScoped = [optionalJWT, frameworkContext, tierGate] as const;
  app.use('/api/capabilities', ...frameworkScoped, capabilitiesRouter);
  app.use('/api/framework-mappings', frameworkMappingsRouter);
  app.use('/api/keys', keysRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use(errorHandler);
  return app;
}

describe('tier-control invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HERM is free (FREE + anonymous reach capability data)', () => {
    it('anonymous caller can list capabilities against the public HERM framework', async () => {
      prismaMock.framework.findFirst.mockResolvedValueOnce(PUBLIC_HERM_FRAMEWORK);
      capabilitiesServiceMock.listCapabilities.mockResolvedValueOnce({
        capabilities: [{ code: 'BC008', title: 'Programme management' }],
        licence: { type: 'CC-BY-NC-SA-4.0' },
      });
      const res = await request(buildApp()).get('/api/capabilities');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.licence?.type).toBe('CC-BY-NC-SA-4.0');
      expect(prismaMock.framework.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isPublic: true, isActive: true }) }),
      );
    });

    it('emits HERM attribution provenance on capability responses (CC-BY-NC-SA / CAUDIT)', async () => {
      // Per HERM_COMPLIANCE.md "HERM attribution travels with the data"
      // every framework-scoped JSON response MUST carry meta.provenance.framework
      // with publisher=CAUDIT and licence.type=CC-BY-NC-SA-4.0 when the
      // active framework is HERM. Locks down the contract anonymous clients
      // (the LicenceAttribution banner, third-party API consumers) rely on.
      prismaMock.framework.findFirst.mockResolvedValueOnce(PUBLIC_HERM_FRAMEWORK);
      capabilitiesServiceMock.listCapabilities.mockResolvedValueOnce({
        capabilities: [],
        licence: { type: 'CC-BY-NC-SA-4.0' },
      });
      const res = await request(buildApp()).get('/api/capabilities');
      expect(res.status).toBe(200);
      const provenance = res.body.meta?.provenance?.framework;
      expect(provenance).toBeDefined();
      expect(provenance.publisher).toBe('CAUDIT');
      expect(provenance.licence?.type).toBe('CC-BY-NC-SA-4.0');
    });

    it('FREE-tier caller can list capabilities (HERM stays free)', async () => {
      prismaMock.framework.findFirst.mockResolvedValueOnce(PUBLIC_HERM_FRAMEWORK);
      capabilitiesServiceMock.listCapabilities.mockResolvedValueOnce({
        capabilities: [{ code: 'BC008' }],
        licence: { type: 'CC-BY-NC-SA-4.0' },
      });
      const res = await request(buildApp())
        .get('/api/capabilities')
        .set('Authorization', `Bearer ${token('free')}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('FREE-tier caller is blocked from a non-public framework (FHE proprietary)', async () => {
      prismaMock.framework.findUnique.mockResolvedValueOnce(PRIVATE_FHE_FRAMEWORK);
      const res = await request(buildApp())
        .get('/api/capabilities?frameworkId=fw-fhe')
        .set('Authorization', `Bearer ${token('free')}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
      expect(capabilitiesServiceMock.listCapabilities).not.toHaveBeenCalled();
    });

    it('PRO-tier caller can read FHE (paid framework)', async () => {
      prismaMock.framework.findUnique.mockResolvedValueOnce(PRIVATE_FHE_FRAMEWORK);
      capabilitiesServiceMock.listCapabilities.mockResolvedValueOnce({
        capabilities: [],
        licence: { type: 'PROPRIETARY' },
      });
      const res = await request(buildApp())
        .get('/api/capabilities?frameworkId=fw-fhe')
        .set('Authorization', `Bearer ${token('pro')}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Enterprise gate (framework-mappings + keys)', () => {
    it('FREE blocked from /api/framework-mappings', async () => {
      const res = await request(buildApp())
        .get('/api/framework-mappings')
        .set('Authorization', `Bearer ${token('free')}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(res.body.error.details.requiredTiers).toEqual(['enterprise']);
      expect(frameworkMappingsServiceMock.list).not.toHaveBeenCalled();
    });

    it('PRO blocked from /api/framework-mappings (enterprise-only)', async () => {
      const res = await request(buildApp())
        .get('/api/framework-mappings')
        .set('Authorization', `Bearer ${token('pro')}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(res.body.error.details.requiredTiers).toEqual(['enterprise']);
    });

    it('ENTERPRISE passes /api/framework-mappings', async () => {
      frameworkMappingsServiceMock.list.mockResolvedValueOnce([]);
      const res = await request(buildApp())
        .get('/api/framework-mappings')
        .set('Authorization', `Bearer ${token('enterprise')}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(frameworkMappingsServiceMock.list).toHaveBeenCalledOnce();
    });

    it('FREE blocked from /api/keys', async () => {
      const res = await request(buildApp())
        .get('/api/keys')
        .set('Authorization', `Bearer ${token('free')}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('anonymous caller hits /api/keys with 401 (auth before tier)', async () => {
      const res = await request(buildApp()).get('/api/keys');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('ENTERPRISE passes /api/keys', async () => {
      prismaMock.apiKey.findMany.mockResolvedValueOnce([]);
      const res = await request(buildApp())
        .get('/api/keys')
        .set('Authorization', `Bearer ${token('enterprise')}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Notifications: anonymous bounces, authed scopes by userId', () => {
    it('anonymous PATCH /:id/read returns 401 (no longer flips arbitrary rows)', async () => {
      const res = await request(buildApp()).patch('/api/notifications/n-other/read');
      expect(res.status).toBe(401);
      expect(prismaMock.notification.updateMany).not.toHaveBeenCalled();
    });

    it('authed PATCH /:id/read scopes the where-clause to req.user.userId', async () => {
      prismaMock.notification.updateMany.mockResolvedValueOnce({ count: 1 });
      const res = await request(buildApp())
        .patch('/api/notifications/n-mine/read')
        .set('Authorization', `Bearer ${token('free')}`);
      expect(res.status).toBe(200);
      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'n-mine', userId: 'user-free' },
        data: { isRead: true },
      });
    });

    it('authed PATCH against another user\'s notification 404s (no row updated)', async () => {
      prismaMock.notification.updateMany.mockResolvedValueOnce({ count: 0 });
      const res = await request(buildApp())
        .patch('/api/notifications/n-not-mine/read')
        .set('Authorization', `Bearer ${token('free')}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
