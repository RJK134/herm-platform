import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { EvaluationsService } from '../evaluations.service';
import { ValidationError } from '../../../utils/errors';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret';

function makeToken(over: Partial<{ userId: string; name: string; institutionId: string }> = {}) {
  return jwt.sign(
    {
      userId: over.userId ?? 'u-actor',
      email: 'actor@test.com',
      name: over.name ?? 'Actor',
      role: 'VIEWER',
      institutionId: over.institutionId ?? 'inst-home',
      institutionName: 'Home Uni',
      tier: 'free',
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

vi.mock('../../../utils/prisma', () => {
  const evaluationProject = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  };
  const evaluationDomainAssignment = {
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  };
  const evaluationDomainScore = {
    upsert: vi.fn(),
    count: vi.fn(),
  };
  const auditLog = { create: vi.fn() };
  const user = { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) };
  const evaluationMember = { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() };
  const evaluationSystem = {
    create: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    createMany: vi.fn(),
  };

  const $transaction = vi.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof mocked.default) => unknown)(mocked.default);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });

  const mocked = {
    default: {
      evaluationProject,
      evaluationDomainAssignment,
      evaluationDomainScore,
      evaluationMember,
      evaluationSystem,
      auditLog,
      user,
      $transaction,
      $disconnect: vi.fn(),
    },
  };
  return mocked;
});

import app from '../../../app';
import prisma from '../../../utils/prisma';

const svc = new EvaluationsService();

describe('PATCH /api/evaluations/:id — transactional audit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes an AuditLog with prior/new fields the client actually sent', async () => {
    vi.mocked(prisma.evaluationProject.findFirst).mockResolvedValueOnce({
      name: 'Original',
      status: 'planning',
      deadline: null,
      basketId: null,
    } as never);
    vi.mocked(prisma.evaluationProject.updateMany).mockResolvedValueOnce({
      count: 1,
    } as never);
    // Final getProject call (post-tx) returns the updated row
    vi.mocked(prisma.evaluationProject.findFirst).mockResolvedValueOnce({
      id: 'eval-1',
      systems: [],
      members: [],
      domainAssignments: [],
    } as never);

    const token = makeToken({ userId: 'u-actor', name: 'Actor' });
    const res = await request(app)
      .patch('/api/evaluations/eval-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed', status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-actor',
        action: 'evaluation.project.update',
        entityType: 'EvaluationProject',
        entityId: 'eval-1',
        changes: expect.objectContaining({
          fromName: 'Original',
          toName: 'Renamed',
          fromStatus: 'planning',
          toStatus: 'in_progress',
          actorName: 'Actor',
        }),
      }),
    });
  });

  it('returns 404 and does NOT write an audit log when project is missing', async () => {
    vi.mocked(prisma.evaluationProject.findFirst).mockResolvedValueOnce(null);

    const token = makeToken();
    const res = await request(app)
      .patch('/api/evaluations/missing')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed' });

    expect(res.status).toBe(404);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.evaluationProject.updateMany).not.toHaveBeenCalled();
  });
});

describe('EvaluationsService.submitDomainScores — transactional audit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes an audit log inside the same tx; flags justCompleted on completion', async () => {
    vi.mocked(prisma.evaluationDomainAssignment.findUnique).mockResolvedValueOnce({
      id: 'asn-1',
      domainId: 'dom-1',
      projectId: 'proj-1',
      domain: { capabilities: [{ id: 'c-1' }, { id: 'c-2' }] },
      project: { systems: [{ systemId: 'sys-1' }] },
    } as never);
    vi.mocked(prisma.evaluationDomainScore.upsert).mockResolvedValue({} as never);
    // 2 caps × 1 system = 2 expected; count returns 2 → justCompleted true
    vi.mocked(prisma.evaluationDomainScore.count).mockResolvedValueOnce(2);
    vi.mocked(prisma.evaluationDomainAssignment.update).mockResolvedValueOnce({} as never);

    const result = await svc.submitDomainScores(
      'asn-1',
      {
        scores: [
          { systemId: 'sys-1', capabilityId: 'c-1', value: 100 },
          { systemId: 'sys-1', capabilityId: 'c-2', value: 50 },
        ],
      },
      { userId: 'u-actor', name: 'Actor' },
    );

    expect(result).toEqual({ submitted: 2, complete: true });
    expect(prisma.evaluationDomainAssignment.update).toHaveBeenCalledWith({
      where: { id: 'asn-1' },
      data: expect.objectContaining({ status: 'completed' }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-actor',
        action: 'evaluation.domain.scores.submit',
        entityType: 'EvaluationDomainAssignment',
        entityId: 'asn-1',
        changes: expect.objectContaining({
          domainId: 'dom-1',
          projectId: 'proj-1',
          scoresSubmitted: 2,
          scoresExpected: 2,
          justCompleted: true,
          actorName: 'Actor',
        }),
      }),
    });
  });

  it('does NOT flip to completed when scores are partial', async () => {
    vi.mocked(prisma.evaluationDomainAssignment.findUnique).mockResolvedValueOnce({
      id: 'asn-1',
      domainId: 'dom-1',
      projectId: 'proj-1',
      domain: { capabilities: [{ id: 'c-1' }, { id: 'c-2' }] },
      project: { systems: [{ systemId: 'sys-1' }] },
    } as never);
    vi.mocked(prisma.evaluationDomainScore.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.evaluationDomainScore.count).mockResolvedValueOnce(1);

    const result = await svc.submitDomainScores(
      'asn-1',
      { scores: [{ systemId: 'sys-1', capabilityId: 'c-1', value: 100 }] },
    );

    expect(result.complete).toBe(false);
    expect(prisma.evaluationDomainAssignment.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: expect.objectContaining({ justCompleted: false }),
      }),
    });
  });

  it('returns 404 NotFoundError without writing scores or audit', async () => {
    vi.mocked(prisma.evaluationDomainAssignment.findUnique).mockResolvedValueOnce(null);

    await expect(
      svc.submitDomainScores('missing', { scores: [] }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.evaluationDomainScore.upsert).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/evaluations/:id/members — error envelope', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the standard validation envelope when neither userId nor email is provided', async () => {
    // Regression for audit Gap 3.1: previously the controller wrote a
    // raw 400 response itself. It now throws ValidationError so the
    // global errorHandler renders the canonical envelope, matching
    // every other validation failure on the surface.
    const token = makeToken();
    const res = await request(app)
      .post('/api/evaluations/eval-1/members')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'evaluator' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'userId or email required',
        requestId: expect.any(String),
      }),
    });
  });

  // Sanity check: ValidationError unit shape (used by the surface
  // assertion above) hasn't drifted.
  it('ValidationError carries statusCode 400 and code VALIDATION_ERROR', () => {
    const err = new ValidationError('demo');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});
