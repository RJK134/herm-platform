import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret';

function makeToken(
  over: Partial<{
    userId: string;
    name: string;
    role: string;
    institutionId: string;
    tier: string;
  }> = {},
) {
  return jwt.sign(
    {
      userId: over.userId ?? 'u-1',
      email: 'u@test.com',
      name: over.name ?? 'Alice',
      role: over.role ?? 'VIEWER',
      institutionId: over.institutionId ?? 'inst-home',
      institutionName: 'Home Uni',
      tier: over.tier ?? 'free',
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

vi.mock('../../../utils/prisma', () => {
  const evaluationProject = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  };
  const evaluationMember = { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() };
  const evaluationSystem = {
    createMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  };
  const user = { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() };
  const $transaction = vi.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof mocked.default) => unknown)(mocked.default);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  const mocked = {
    default: {
      evaluationProject,
      evaluationMember,
      evaluationSystem,
      user,
      $transaction,
      $disconnect: vi.fn(),
    },
  };
  return mocked;
});

import app from '../../../app';
import prisma from '../../../utils/prisma';

const baseCreateBody = {
  name: 'FY26 SIS evaluation',
  systemIds: ['sys-1', 'sys-2'],
};

describe('evaluations router — auth gate on mutations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /api/evaluations returns 401 for anonymous callers', async () => {
    const res = await request(app).post('/api/evaluations').send(baseCreateBody);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    expect(prisma.evaluationProject.create).not.toHaveBeenCalled();
  });

  it('PATCH /api/evaluations/:id returns 401 for anonymous callers', async () => {
    const res = await request(app)
      .patch('/api/evaluations/eval-1')
      .send({ name: 'renamed' });
    expect(res.status).toBe(401);
    expect(prisma.evaluationProject.updateMany).not.toHaveBeenCalled();
  });

  it('POST /api/evaluations/:id/members returns 401 for anonymous callers', async () => {
    const res = await request(app)
      .post('/api/evaluations/eval-1/members')
      .send({ userId: 'u-2', role: 'evaluator' });
    expect(res.status).toBe(401);
  });

  it('POST /api/evaluations/:id/domains/:domainId/scores returns 401 anon', async () => {
    const res = await request(app)
      .post('/api/evaluations/eval-1/domains/dom-1/scores')
      .send({ scores: [] });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/evaluations — tenant scoping ignores ?institutionId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses JWT institutionId, NOT the query param, for authenticated callers', async () => {
    // Regression: previously `?institutionId=other-tenant` leaked another
    // tenant's projects. Compound filter now comes from req.user only.
    vi.mocked(prisma.evaluationProject.findMany).mockResolvedValueOnce([] as never);
    const token = makeToken({ institutionId: 'inst-home' });

    const res = await request(app)
      .get('/api/evaluations?institutionId=inst-victim')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(prisma.evaluationProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { institutionId: 'inst-home' },
      }),
    );
  });

  it('anonymous callers see only the sentinel tenant', async () => {
    vi.mocked(prisma.evaluationProject.findMany).mockResolvedValueOnce([] as never);

    const res = await request(app).get('/api/evaluations?institutionId=inst-victim');

    expect(res.status).toBe(200);
    expect(prisma.evaluationProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { institutionId: 'anonymous' },
      }),
    );
  });
});

describe('GET /api/evaluations/:id — cross-tenant isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when the project belongs to a different tenant', async () => {
    // findFirst with compound {id, institutionId} returns null for both
    // "truly missing" and "exists but different tenant" — no oracle.
    vi.mocked(prisma.evaluationProject.findFirst).mockResolvedValueOnce(null);
    const token = makeToken({ institutionId: 'inst-home' });

    const res = await request(app)
      .get('/api/evaluations/eval-from-other-tenant')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(prisma.evaluationProject.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'eval-from-other-tenant', institutionId: 'inst-home' },
      }),
    );
  });
});

describe('POST /api/evaluations — institutionId spoof rejection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ignores body-supplied institutionId; stamps from JWT unconditionally', async () => {
    vi.mocked(prisma.evaluationProject.create).mockResolvedValueOnce({
      id: 'eval-1',
    } as never);
    vi.mocked(prisma.evaluationProject.findFirst).mockResolvedValueOnce({
      id: 'eval-1',
      institutionId: 'inst-home',
      systems: [],
      members: [],
      domainAssignments: [],
    } as never);

    const token = makeToken({ userId: 'u-attacker', institutionId: 'inst-home' });
    await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...baseCreateBody,
        // Spoof — schema strips this and controller stamps from JWT.
        institutionId: 'inst-victim',
      });

    expect(prisma.evaluationProject.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          institutionId: 'inst-home',
          leadUserId: 'u-attacker',
        }),
      }),
    );
  });
});
