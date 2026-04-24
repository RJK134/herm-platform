import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

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

// Typed helpers so the transactional reads/writes work even though each
// test overrides individual mock returns. All mocks live at module
// scope so tests can reach through `vi.mocked(prisma.x.y)`.
vi.mock('../../../utils/prisma', () => {
  const stageTask = { findUnique: vi.fn(), update: vi.fn() };
  const stageApproval = { findUnique: vi.fn(), update: vi.fn() };
  const procurementEvaluation = {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  };
  const auditLog = { create: vi.fn(), findMany: vi.fn() };
  const institution = { findUnique: vi.fn() };
  const procurementProject = { findUnique: vi.fn(), findMany: vi.fn() };

  const $transaction = vi.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof mocked.default) => unknown)(mocked.default);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });

  const mocked = {
    default: {
      stageTask,
      stageApproval,
      procurementEvaluation,
      auditLog,
      institution,
      procurementProject,
      $transaction,
      $disconnect: vi.fn(),
    },
  };
  return mocked;
});

vi.mock('../../../services/procurement-engine', () => ({
  procurementEngine: {
    advanceStage: vi.fn().mockResolvedValue({ success: true, newStage: 'NEGOTIATION' }),
    runComplianceCheck: vi.fn(),
    createProjectWithStages: vi.fn(),
    getStageDefinitions: vi.fn().mockReturnValue([]),
    generateTimeline: vi.fn().mockReturnValue([]),
    hermToSpecification: vi.fn().mockReturnValue([]),
  },
}));

import app from '../../../app';
import prisma from '../../../utils/prisma';
import { procurementEngine } from '../../../services/procurement-engine';

describe('POST /api/procurement/v2/projects/:id/advance — audit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('threads actor identity into procurementEngine.advanceStage', async () => {
    const token = makeToken({ userId: 'u-actor', name: 'Actor' });
    const res = await request(app)
      .post('/api/procurement/v2/projects/p-1/advance')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(procurementEngine.advanceStage).toHaveBeenCalledWith(
      'p-1',
      expect.objectContaining({ userId: 'u-actor', name: 'Actor' }),
    );
  });
});

describe('PATCH /v2/.../tasks/:id — transactional audit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes an AuditLog inside the same transaction as the task update', async () => {
    vi.mocked(prisma.stageTask.findUnique).mockResolvedValueOnce({
      isCompleted: false,
      completedBy: null,
      completedAt: null,
    } as never);
    vi.mocked(prisma.stageTask.update).mockResolvedValueOnce({
      id: 't-1',
      isCompleted: true,
      completedBy: 'Actor',
    } as never);

    const token = makeToken({ userId: 'u-actor', name: 'Actor' });
    const res = await request(app)
      .patch('/api/procurement/v2/projects/p-1/stages/s-1/tasks/t-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ isCompleted: true });

    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-actor',
        action: 'procurement.task.update',
        entityType: 'StageTask',
        entityId: 't-1',
        changes: expect.objectContaining({
          fromCompleted: false,
          toCompleted: true,
          completedBy: 'Actor',
        }),
      }),
    });
  });

  it('stamps completedBy from the JWT when no override is provided', async () => {
    vi.mocked(prisma.stageTask.findUnique).mockResolvedValueOnce({
      isCompleted: false, completedBy: null, completedAt: null,
    } as never);
    vi.mocked(prisma.stageTask.update).mockResolvedValueOnce({
      id: 't-1', isCompleted: true, completedBy: 'Jamie',
    } as never);

    const token = makeToken({ name: 'Jamie' });
    await request(app)
      .patch('/api/procurement/v2/projects/p-1/stages/s-1/tasks/t-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ isCompleted: true });

    expect(prisma.stageTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ completedBy: 'Jamie' }),
      }),
    );
  });
});

describe('PATCH /v2/.../approvals/:id — transactional audit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes an AuditLog with fromStatus/toStatus', async () => {
    vi.mocked(prisma.stageApproval.findUnique).mockResolvedValueOnce({
      status: 'pending', approverName: null, comments: null,
    } as never);
    vi.mocked(prisma.stageApproval.update).mockResolvedValueOnce({
      id: 'a-1', status: 'approved', approverName: 'Actor', comments: 'LGTM',
    } as never);

    const token = makeToken({ userId: 'u-actor', name: 'Actor' });
    const res = await request(app)
      .patch('/api/procurement/v2/projects/p-1/stages/s-1/approvals/a-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved', approverName: 'Actor', comments: 'LGTM' });

    expect(res.status).toBe(200);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-actor',
        action: 'procurement.approval.decide',
        entityType: 'StageApproval',
        entityId: 'a-1',
        changes: expect.objectContaining({
          fromStatus: 'pending',
          toStatus: 'approved',
        }),
      }),
    });
  });
});

describe('POST /v2/projects/:id/evaluations — transactional audit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('logs an "add" action when no prior evaluation exists', async () => {
    vi.mocked(prisma.procurementEvaluation.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.procurementEvaluation.upsert).mockResolvedValueOnce({
      id: 'eval-1',
    } as never);

    const token = makeToken({ userId: 'u-actor', name: 'Actor' });
    const res = await request(app)
      .post('/api/procurement/v2/projects/p-1/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .send({ systemId: 'sys-1' });

    expect(res.status).toBe(201);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-actor',
        action: 'procurement.evaluation.add',
        entityType: 'ProcurementEvaluation',
        entityId: 'eval-1',
      }),
    });
  });

  it('logs a "reweight" action when the evaluation already exists', async () => {
    vi.mocked(prisma.procurementEvaluation.findUnique).mockResolvedValueOnce({
      id: 'eval-1',
      weightingProfile: { framework: 40 },
    } as never);
    vi.mocked(prisma.procurementEvaluation.upsert).mockResolvedValueOnce({
      id: 'eval-1',
    } as never);

    const token = makeToken({ userId: 'u-actor', name: 'Actor' });
    const res = await request(app)
      .post('/api/procurement/v2/projects/p-1/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        systemId: 'sys-1',
        weightingProfile: {
          framework: 50, technical: 20, commercial: 20, implementation: 5, reference: 5,
        },
      });

    expect(res.status).toBe(201);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'procurement.evaluation.reweight',
      }),
    });
  });
});

describe('PATCH /v2/.../evaluations/:id — transactional read-modify-write', () => {
  beforeEach(() => vi.clearAllMocks());

  it('wraps the read + update + audit-log in a single $transaction', async () => {
    // Regression for audit Gap 4.3: previously the read-then-write was
    // split across two top-level awaits, leaving a window where a
    // concurrent PATCH could overwrite scores between our read and
    // write. Now everything lives inside one callback tx.
    vi.mocked(prisma.procurementEvaluation.findUnique).mockResolvedValueOnce({
      id: 'eval-1',
      frameworkScore: 50,
      technicalScore: 50,
      commercialScore: 50,
      implementationScore: 50,
      referenceScore: 50,
      overallScore: 50,
      recommendation: 'reserve',
      weightingProfile: { framework: 40, technical: 25, commercial: 20, implementation: 10, reference: 5 },
      notes: null,
    } as never);
    vi.mocked(prisma.procurementEvaluation.update).mockResolvedValueOnce({
      id: 'eval-1',
      overallScore: 80,
      recommendation: 'award',
      system: { id: 'sys-1', name: 'Sys', vendor: 'V' },
    } as never);

    const token = makeToken({ userId: 'u-actor', name: 'Actor' });
    const res = await request(app)
      .patch('/api/procurement/v2/projects/p-1/evaluations/eval-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ frameworkScore: 90, technicalScore: 90 });

    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-actor',
        action: 'procurement.evaluation.update',
        entityType: 'ProcurementEvaluation',
        entityId: 'eval-1',
        changes: expect.objectContaining({
          fromRecommendation: 'reserve',
          toRecommendation: 'award',
          fromOverallScore: 50,
          toOverallScore: 80,
        }),
      }),
    });
  });

  it('returns 404 for a missing evaluation and does NOT write an audit log', async () => {
    vi.mocked(prisma.procurementEvaluation.findUnique).mockResolvedValueOnce(null);

    const token = makeToken();
    const res = await request(app)
      .patch('/api/procurement/v2/projects/p-1/evaluations/missing')
      .set('Authorization', `Bearer ${token}`)
      .send({ frameworkScore: 80 });

    expect(res.status).toBe(404);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
