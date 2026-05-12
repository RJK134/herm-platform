/**
 * Tier-control invariants for /api/sector/analytics/*.
 *
 * Pre-fix the router used `optionalJWT` only — anonymous and free-tier
 * callers reached every endpoint, with k-anonymity (≥5 institutions) the
 * only privacy floor and `jurisdictions` / `trends` exposed unconditionally.
 *
 * Post-fix the router gates with `authenticateJWT + requirePaidTier(
 * ['pro','enterprise'])`. These tests pin that contract end-to-end
 * through the real router + middleware stack:
 *   - anonymous → 401 AUTHENTICATION_ERROR (no controller / Prisma side-effects)
 *   - FREE     → 403 SUBSCRIPTION_REQUIRED with details.requiredTiers
 *   - PROFESSIONAL → controller reached
 *   - ENTERPRISE   → controller reached
 *   - SUPER_ADMIN bypasses the tier gate (per requirePaidTier contract)
 *
 * Source of truth: HERM_COMPLIANCE.md "Paid-tier gated" + the IA matrix
 * "Sector Intelligence | Professional/Enterprise (per item)".
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

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    institution: { count: vi.fn(), findMany: vi.fn() },
    evaluationProject: { count: vi.fn(), findMany: vi.fn() },
    procurementProject: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    vendorSystem: { findMany: vi.fn() },
    basketItem: { groupBy: vi.fn() },
    capability: { findMany: vi.fn() },
    procurementJurisdiction: { findMany: vi.fn() },
  },
}));
vi.mock('../utils/prisma', () => ({ default: prismaMock }));

import sectorAnalyticsRouter from '../api/sector-analytics/sector-analytics.router';

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

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/sector/analytics', sectorAnalyticsRouter);
  app.use(errorHandler);
  return app;
}

describe('/api/sector/analytics tier gate', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Auth (anonymous → 401, no Prisma side-effects) ──────────────────────

  describe.each([
    ['/overview', 'GET'],
    ['/systems', 'GET'],
    ['/capabilities', 'GET'],
    ['/jurisdictions', 'GET'],
    ['/trends', 'GET'],
  ])('anonymous on %s', (path) => {
    it('returns 401 and never reaches Prisma', async () => {
      const res = await request(buildApp()).get(`/api/sector/analytics${path}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
      expect(prismaMock.institution.count).not.toHaveBeenCalled();
      expect(prismaMock.procurementProject.findMany).not.toHaveBeenCalled();
    });
  });

  // ── Tier (FREE → 403 SUBSCRIPTION_REQUIRED) ─────────────────────────────

  describe.each([
    ['/overview'],
    ['/systems'],
    ['/capabilities'],
    ['/jurisdictions'],
    ['/trends'],
  ])('free-tier on %s', (path) => {
    it('returns 403 SUBSCRIPTION_REQUIRED with details.requiredTiers', async () => {
      const res = await request(buildApp())
        .get(`/api/sector/analytics${path}`)
        .set('Authorization', `Bearer ${token('free')}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(res.body.error.details.requiredTiers).toEqual(['pro', 'enterprise']);
      expect(res.body.error.details.currentTier).toBe('free');
      expect(prismaMock.institution.count).not.toHaveBeenCalled();
    });
  });

  // ── Tier (PROFESSIONAL passes; controller reached) ──────────────────────

  it('PRO reaches the overview controller', async () => {
    prismaMock.institution.count.mockResolvedValueOnce(3); // below k-anon threshold
    prismaMock.evaluationProject.count.mockResolvedValueOnce(0);
    prismaMock.procurementProject.count.mockResolvedValueOnce(0);
    const res = await request(buildApp())
      .get('/api/sector/analytics/overview')
      .set('Authorization', `Bearer ${token('pro')}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prismaMock.institution.count).toHaveBeenCalled();
  });

  // ── Tier (ENTERPRISE passes; controller reached) ────────────────────────

  it('ENTERPRISE reaches the trends controller', async () => {
    prismaMock.evaluationProject.findMany.mockResolvedValueOnce([]);
    prismaMock.procurementProject.findMany.mockResolvedValueOnce([]);
    prismaMock.institution.findMany.mockResolvedValueOnce([]);
    const res = await request(buildApp())
      .get('/api/sector/analytics/trends')
      .set('Authorization', `Bearer ${token('enterprise')}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prismaMock.evaluationProject.findMany).toHaveBeenCalled();
  });

  // ── SUPER_ADMIN bypass (matches requirePaidTier contract) ──────────────

  it('SUPER_ADMIN bypasses the tier gate even on a free-tier token', async () => {
    prismaMock.procurementJurisdiction.findMany.mockResolvedValueOnce([]);
    prismaMock.procurementProject.groupBy.mockResolvedValueOnce([]);
    const res = await request(buildApp())
      .get('/api/sector/analytics/jurisdictions')
      .set('Authorization', `Bearer ${token('free', { role: 'SUPER_ADMIN' })}`);
    expect(res.status).toBe(200);
  });
});
