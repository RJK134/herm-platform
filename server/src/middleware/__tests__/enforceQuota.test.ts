import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { enforceQuota, recordUsage } from '../enforceQuota';
import { currentPeriod } from '../../lib/tier-quotas';

// Phase 15.3 — enforceQuota + recordUsage regression tests.
//
// Pins the four contract corners:
//   (a) Free institution at quota → 402 QUOTA_EXCEEDED with
//       { metric, used, limit, tier, period } payload.
//   (b) Pro institution well under quota → 200 through.
//   (c) Enterprise + SUPER_ADMIN role both bypass.
//   (d) Period rollover: a counter row stamped for last month does
//       not count against this month's allowance.
//
// recordUsage is best-effort — a third group asserts it doesn't throw
// when the upsert fails, so a counter-write failure can't bring down
// a successful create.

const findUniqueMock = vi.fn();
const upsertMock = vi.fn();

vi.mock('../../utils/prisma', () => ({
  default: {
    usageCounter: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      upsert: (...args: unknown[]) => upsertMock(...args),
    },
  },
}));

beforeEach(() => {
  findUniqueMock.mockReset();
  upsertMock.mockReset();
});

function buildApp(user: Record<string, unknown>) {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { user: typeof user }).user = user;
    next();
  });
  app.post('/projects', enforceQuota('procurement.projects'), (_req, res) => {
    res.status(201).json({ success: true });
  });
  return app;
}

describe('enforceQuota — Phase 15.3', () => {
  describe('quota gating', () => {
    it('returns 402 QUOTA_EXCEEDED when a free tenant has reached the cap', async () => {
      findUniqueMock.mockResolvedValue({ count: 3 });
      const app = buildApp({
        userId: 'u1', institutionId: 'inst-1', tier: 'free', role: 'VIEWER',
      });

      const res = await request(app).post('/projects');

      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe('QUOTA_EXCEEDED');
      expect(res.body.error.details).toMatchObject({
        metric: 'procurement.projects',
        used: 3,
        limit: 3,
        tier: 'free',
        period: currentPeriod(),
      });
      // Failed gate must NOT have touched the upsert path.
      expect(upsertMock).not.toHaveBeenCalled();
    });

    it('lets a free tenant through when under the cap', async () => {
      findUniqueMock.mockResolvedValue({ count: 2 });
      const app = buildApp({
        userId: 'u1', institutionId: 'inst-1', tier: 'free', role: 'VIEWER',
      });

      const res = await request(app).post('/projects');

      expect(res.status).toBe(201);
    });

    it('treats missing counter row as count=0', async () => {
      findUniqueMock.mockResolvedValue(null);
      const app = buildApp({
        userId: 'u1', institutionId: 'inst-1', tier: 'free', role: 'VIEWER',
      });

      const res = await request(app).post('/projects');

      expect(res.status).toBe(201);
    });
  });

  describe('tier bypasses', () => {
    it('skips the DB read entirely for an unlimited (pro) metric', async () => {
      // Pro tier has procurement.projects = unlimited per tier-quotas.ts.
      // The middleware should NOT call findUnique.
      const app = buildApp({
        userId: 'u1', institutionId: 'inst-1', tier: 'pro', role: 'VIEWER',
      });

      const res = await request(app).post('/projects');

      expect(res.status).toBe(201);
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('skips the DB read for enterprise', async () => {
      const app = buildApp({
        userId: 'u1', institutionId: 'inst-1', tier: 'enterprise', role: 'VIEWER',
      });

      const res = await request(app).post('/projects');

      expect(res.status).toBe(201);
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('SUPER_ADMIN bypasses regardless of tier or current usage', async () => {
      // Even if the counter sat at 9999, SUPER_ADMIN passes through.
      // Critically we should NOT have called findUnique — the bypass
      // is short-circuiting the quota path entirely.
      findUniqueMock.mockResolvedValue({ count: 9999 });
      const app = buildApp({
        userId: 'admin', institutionId: 'inst-1', tier: 'free', role: 'SUPER_ADMIN',
      });

      const res = await request(app).post('/projects');

      expect(res.status).toBe(201);
      expect(findUniqueMock).not.toHaveBeenCalled();
    });
  });

  describe('period rollover', () => {
    it('queries the counter scoped to the current YYYY-MM period', async () => {
      findUniqueMock.mockResolvedValue({ count: 1 });
      const app = buildApp({
        userId: 'u1', institutionId: 'inst-rollover', tier: 'free', role: 'VIEWER',
      });

      await request(app).post('/projects');

      const expectedPeriod = currentPeriod();
      expect(findUniqueMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            institutionId_metric_period: {
              institutionId: 'inst-rollover',
              metric: 'procurement.projects',
              period: expectedPeriod,
            },
          },
        }),
      );
    });
  });

  describe('recordUsage — best-effort semantics', () => {
    it('upserts the counter for the current period', async () => {
      upsertMock.mockResolvedValue({ count: 1 });

      await recordUsage('inst-1', 'baskets');

      expect(upsertMock).toHaveBeenCalledTimes(1);
      const arg = upsertMock.mock.calls[0]![0] as {
        where: { institutionId_metric_period: { period: string } };
      };
      expect(arg.where.institutionId_metric_period.period).toBe(currentPeriod());
    });

    it('swallows DB errors so a counter failure cannot break the user-facing write', async () => {
      upsertMock.mockRejectedValue(new Error('postgres exploded'));

      // No throw — recordUsage logs and returns void.
      await expect(recordUsage('inst-1', 'baskets')).resolves.toBeUndefined();
    });

    it('no-ops for non-positive deltas', async () => {
      await recordUsage('inst-1', 'baskets', 0);
      await recordUsage('inst-1', 'baskets', -1);
      expect(upsertMock).not.toHaveBeenCalled();
    });
  });
});
