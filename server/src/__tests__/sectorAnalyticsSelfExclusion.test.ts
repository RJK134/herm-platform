/**
 * Phase 10 / 10.1: SELF-EXCLUSION invariants for /api/sector/analytics/*.
 *
 * Tier-gating is covered by sectorAnalyticsTierGate.test.ts. This file pins
 * the data-isolation contract: every aggregate response excludes the
 * caller's own institution from the dataset, so a paid-tier customer
 * querying "top capabilities across the sector" doesn't see their OWN
 * baskets contributing to the leaderboard.
 *
 * The k-anonymity floor (≥ MIN_INSTITUTIONS=5 others) is computed against
 * the EXCLUDED count, so a 5-institution platform with one caller hides
 * everything (count=4 fails the threshold) — by design, conservative.
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

function tokenFor(institutionId: string, tier: 'pro' | 'enterprise' = 'enterprise'): string {
  return jwt.sign(
    {
      userId: `user-${institutionId}`,
      email: `user@${institutionId}.test`,
      name: 'caller',
      role: 'VIEWER',
      institutionId,
      institutionName: institutionId,
      tier,
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

beforeEach(() => vi.clearAllMocks());

describe('/api/sector/analytics — self-exclusion', () => {
  it('GET /overview excludes the caller\'s institution from every count', async () => {
    prismaMock.institution.count.mockResolvedValueOnce(7);
    prismaMock.evaluationProject.count.mockResolvedValueOnce(20);
    prismaMock.procurementProject.count.mockResolvedValueOnce(15);
    prismaMock.vendorSystem.findMany.mockResolvedValueOnce([]);
    prismaMock.basketItem.groupBy.mockResolvedValueOnce([]);

    await request(buildApp())
      .get('/api/sector/analytics/overview')
      .set('Authorization', `Bearer ${tokenFor('inst-A')}`);

    expect(prismaMock.institution.count).toHaveBeenCalledWith({
      where: { NOT: { id: 'inst-A' } },
    });
    expect(prismaMock.evaluationProject.count).toHaveBeenCalledWith({
      where: { NOT: { institutionId: 'inst-A' } },
    });
    expect(prismaMock.procurementProject.count).toHaveBeenCalledWith({
      where: { NOT: { institutionId: 'inst-A' } },
    });
  });

  it('GET /overview excludes caller\'s baskets from topCapabilities', async () => {
    prismaMock.institution.count.mockResolvedValueOnce(7);
    prismaMock.evaluationProject.count.mockResolvedValueOnce(0);
    prismaMock.procurementProject.count.mockResolvedValueOnce(0);
    prismaMock.vendorSystem.findMany.mockResolvedValueOnce([]);
    prismaMock.basketItem.groupBy.mockResolvedValueOnce([]);

    await request(buildApp())
      .get('/api/sector/analytics/overview')
      .set('Authorization', `Bearer ${tokenFor('inst-A')}`);

    expect(prismaMock.basketItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { basket: { NOT: { institutionId: 'inst-A' } } },
      }),
    );
  });

  it('GET /overview k-anon checks the EXCLUDED count, not total — 5 total → 4 excluded → no leaderboard', async () => {
    // 5 institutions total, caller is one of them, so excluded count = 4.
    // 4 < MIN_INSTITUTIONS (5), so topSystems / topCapabilities are empty
    // (no aggregate queries fired).
    prismaMock.institution.count.mockResolvedValueOnce(4);
    prismaMock.evaluationProject.count.mockResolvedValueOnce(0);
    prismaMock.procurementProject.count.mockResolvedValueOnce(0);

    const res = await request(buildApp())
      .get('/api/sector/analytics/overview')
      .set('Authorization', `Bearer ${tokenFor('inst-A')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.topSystems).toEqual([]);
    expect(res.body.data.topCapabilities).toEqual([]);
    // The aggregate queries must NOT have fired below the threshold —
    // any prisma call with .basket scoping or vendorSystem.findMany would
    // be a leak of the threshold.
    expect(prismaMock.vendorSystem.findMany).not.toHaveBeenCalled();
    expect(prismaMock.basketItem.groupBy).not.toHaveBeenCalled();
  });

  it('GET /capabilities excludes caller\'s baskets', async () => {
    prismaMock.institution.count.mockResolvedValueOnce(10);
    prismaMock.basketItem.groupBy.mockResolvedValueOnce([]);
    prismaMock.capability.findMany.mockResolvedValueOnce([]);

    await request(buildApp())
      .get('/api/sector/analytics/capabilities')
      .set('Authorization', `Bearer ${tokenFor('inst-B')}`);

    expect(prismaMock.basketItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { basket: { NOT: { institutionId: 'inst-B' } } },
      }),
    );
  });

  it('GET /jurisdictions excludes caller\'s procurement projects', async () => {
    prismaMock.procurementJurisdiction.findMany.mockResolvedValueOnce([]);
    prismaMock.procurementProject.groupBy.mockResolvedValueOnce([]);

    await request(buildApp())
      .get('/api/sector/analytics/jurisdictions')
      .set('Authorization', `Bearer ${tokenFor('inst-C')}`);

    expect(prismaMock.procurementProject.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { NOT: { institutionId: 'inst-C' } },
      }),
    );
  });

  it('GET /trends excludes the caller\'s data from all three series', async () => {
    prismaMock.evaluationProject.findMany.mockResolvedValueOnce([]);
    prismaMock.procurementProject.findMany.mockResolvedValueOnce([]);
    prismaMock.institution.findMany.mockResolvedValueOnce([]);

    await request(buildApp())
      .get('/api/sector/analytics/trends')
      .set('Authorization', `Bearer ${tokenFor('inst-D')}`);

    expect(prismaMock.evaluationProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ NOT: { institutionId: 'inst-D' } }),
      }),
    );
    expect(prismaMock.procurementProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ NOT: { institutionId: 'inst-D' } }),
      }),
    );
    expect(prismaMock.institution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ NOT: { id: 'inst-D' } }),
      }),
    );
  });

  it('GET /systems applies k-anon against the excluded count', async () => {
    // 4 excluded → below threshold → empty data + note. No vendorSystem read.
    prismaMock.institution.count.mockResolvedValueOnce(4);
    const res = await request(buildApp())
      .get('/api/sector/analytics/systems')
      .set('Authorization', `Bearer ${tokenFor('inst-E')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.note).toMatch(/insufficient/i);
    expect(prismaMock.vendorSystem.findMany).not.toHaveBeenCalled();
  });
});
