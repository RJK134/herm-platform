import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

// Phase 16.8 — GET /api/usage contract test.
//
// Pins:
//   - Anonymous → 401 (auth required, can't surface tenant data).
//   - Authed Free user → 200 + every metric in the table with
//     `used` from the counter row (or 0 when no row exists this
//     period) and `limit` from the per-tier quota constants.
//   - Authed Pro user → metrics that are 'unlimited' on Pro return
//     the literal string 'unlimited' as `limit` (string sentinel).

const findManyMock = vi.fn();

vi.mock('../../../utils/prisma', () => ({
  default: {
    usageCounter: {
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

const SECRET = process.env['JWT_SECRET'] ?? 'test-jwt-secret-do-not-use-in-prod';

beforeEach(() => {
  process.env['JWT_SECRET'] = SECRET;
  findManyMock.mockReset();
});

function token(tier: string, institutionId = 'inst-1'): string {
  return jwt.sign(
    {
      userId: 'u-1',
      email: 'u@inst.test',
      name: 'Test',
      role: 'VIEWER',
      institutionId,
      institutionName: 'Test Inst',
      tier,
    },
    SECRET,
    { expiresIn: '1h' },
  );
}

async function buildApp() {
  const { default: usageRouter } = await import('../usage.router');
  const app = express();
  app.use(express.json());
  app.use('/api/usage', usageRouter);
  return app;
}

describe('GET /api/usage', () => {
  it('returns 401 for anonymous callers', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/usage');
    expect(res.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('returns every metric for a Free user with counts derived from existing rows', async () => {
    findManyMock.mockResolvedValue([
      { metric: 'procurement.projects', count: 2 },
      { metric: 'baskets', count: 1 },
      // document.generation, tco.calculations, team.members have no rows
      // yet — controller should return 0 for those.
    ]);
    const app = await buildApp();
    const res = await request(app)
      .get('/api/usage')
      .set('Authorization', `Bearer ${token('free')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tier).toBe('free');
    expect(res.body.data.period).toMatch(/^\d{4}-\d{2}$/);
    const byMetric = Object.fromEntries(
      (res.body.data.metrics as Array<{ metric: string; used: number; limit: number | string }>).map(
        m => [m.metric, m],
      ),
    );
    expect(byMetric['procurement.projects']).toEqual({
      metric: 'procurement.projects', used: 2, limit: 3,
    });
    expect(byMetric['baskets']).toEqual({ metric: 'baskets', used: 1, limit: 3 });
    expect(byMetric['document.generation']).toEqual({
      metric: 'document.generation', used: 0, limit: 5,
    });
    expect(byMetric['team.members']).toEqual({
      metric: 'team.members', used: 0, limit: 2,
    });
    expect(byMetric['tco.calculations']).toEqual({
      metric: 'tco.calculations', used: 0, limit: 10,
    });
  });

  it('returns "unlimited" sentinel for Pro-tier metrics that are uncapped', async () => {
    findManyMock.mockResolvedValue([]);
    const app = await buildApp();
    const res = await request(app)
      .get('/api/usage')
      .set('Authorization', `Bearer ${token('pro')}`);

    expect(res.status).toBe(200);
    const byMetric = Object.fromEntries(
      (res.body.data.metrics as Array<{ metric: string; limit: number | string }>).map(
        m => [m.metric, m.limit],
      ),
    );
    // Pro is unlimited on everything except team.members (10).
    expect(byMetric['procurement.projects']).toBe('unlimited');
    expect(byMetric['baskets']).toBe('unlimited');
    expect(byMetric['document.generation']).toBe('unlimited');
    expect(byMetric['tco.calculations']).toBe('unlimited');
    expect(byMetric['team.members']).toBe(10);
  });

  it('scopes the read to the caller institution + current period', async () => {
    findManyMock.mockResolvedValue([]);
    const app = await buildApp();
    await request(app)
      .get('/api/usage')
      .set('Authorization', `Bearer ${token('free', 'inst-scoped')}`);

    const period = new Date().toISOString().slice(0, 7);
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { institutionId: 'inst-scoped', period },
      }),
    );
  });
});
