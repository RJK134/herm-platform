import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret';

function makeToken(over: Partial<{ userId: string; institutionId: string }> = {}) {
  return jwt.sign(
    {
      userId: over.userId ?? 'u-1',
      email: 'u@test.com',
      name: 'Alice',
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
  const institution = { findUnique: vi.fn(), upsert: vi.fn() };
  const procurementProject = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  };
  const stageTask = { update: vi.fn() };
  const stageApproval = { update: vi.fn() };
  const procurementEvaluation = {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  };
  return {
    default: {
      institution,
      procurementProject,
      stageTask,
      stageApproval,
      procurementEvaluation,
      $transaction: vi.fn(),
      $disconnect: vi.fn(),
    },
  };
});

// Prevent the engine from doing real work when createProjectV2 proceeds.
vi.mock('../../../services/procurement-engine', () => ({
  procurementEngine: {
    createProjectWithStages: vi.fn().mockResolvedValue({ id: 'proj-1' }),
    advanceStage: vi.fn().mockResolvedValue({ success: true, newStage: 'next' }),
    runComplianceCheck: vi.fn(),
    getStageDefinitions: vi.fn().mockReturnValue([]),
    generateTimeline: vi.fn().mockReturnValue([]),
    hermToSpecification: vi.fn().mockReturnValue([]),
  },
}));

import app from '../../../app';
import prisma from '../../../utils/prisma';
import { procurementEngine } from '../../../services/procurement-engine';

const validCreateBody = {
  name: 'FY26 SIS procurement',
  jurisdiction: 'UK',
};

describe('procurement v2 router — auth gate on state-changing routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /api/procurement/v2/projects returns 401 for anonymous callers', async () => {
    const res = await request(app)
      .post('/api/procurement/v2/projects')
      .send(validCreateBody);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    expect(procurementEngine.createProjectWithStages).not.toHaveBeenCalled();
  });

  it('POST /api/procurement/v2/projects/:id/advance returns 401 anon', async () => {
    const res = await request(app).post('/api/procurement/v2/projects/p-1/advance');
    expect(res.status).toBe(401);
    expect(procurementEngine.advanceStage).not.toHaveBeenCalled();
  });

  it('PATCH /api/procurement/v2/projects/:id/stages/:sid/tasks/:tid returns 401 anon', async () => {
    const res = await request(app)
      .patch('/api/procurement/v2/projects/p-1/stages/s-1/tasks/t-1')
      .send({ isCompleted: true });
    expect(res.status).toBe(401);
    expect(prisma.stageTask.update).not.toHaveBeenCalled();
  });

  it('PATCH /api/procurement/v2/projects/:id/stages/:sid/approvals/:aid returns 401 anon', async () => {
    const res = await request(app)
      .patch('/api/procurement/v2/projects/p-1/stages/s-1/approvals/a-1')
      .send({ decision: 'approved' });
    expect(res.status).toBe(401);
    expect(prisma.stageApproval.update).not.toHaveBeenCalled();
  });

  it('POST /api/procurement/v2/projects/:id/evaluations returns 401 anon', async () => {
    const res = await request(app)
      .post('/api/procurement/v2/projects/p-1/evaluations')
      .send({ systemId: 'sys-1' });
    expect(res.status).toBe(401);
    expect(prisma.procurementEvaluation.upsert).not.toHaveBeenCalled();
  });

  it('PATCH /api/procurement/v2/projects/:id/evaluations/:eid returns 401 anon', async () => {
    const res = await request(app)
      .patch('/api/procurement/v2/projects/p-1/evaluations/e-1')
      .send({ frameworkScore: 80 });
    expect(res.status).toBe(401);
    expect(prisma.procurementEvaluation.update).not.toHaveBeenCalled();
  });

  it('GET /api/procurement/v2/projects/:id stays public (optionalJWT)', async () => {
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      id: 'p-1',
      stages: [],
      evaluations: [],
      complianceChecks: [],
      shortlist: [],
    } as never);

    const res = await request(app).get('/api/procurement/v2/projects/p-1');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/procurement/v2/projects — institutionId spoof rejection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stamps institutionId from JWT, ignoring body override', async () => {
    vi.mocked(prisma.institution.findUnique).mockResolvedValueOnce({
      id: 'inst-home',
      name: 'Home',
    } as never);

    const token = makeToken({ userId: 'u-attacker', institutionId: 'inst-home' });
    await request(app)
      .post('/api/procurement/v2/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...validCreateBody,
        // Spoof — schema strips this; controller reads JWT only.
        institutionId: 'inst-victim',
      });

    expect(procurementEngine.createProjectWithStages).toHaveBeenCalledWith(
      expect.objectContaining({ institutionId: 'inst-home' }),
    );
  });

  it('returns 400 VALIDATION_ERROR when the caller institution no longer exists', async () => {
    vi.mocked(prisma.institution.findUnique).mockResolvedValueOnce(null);

    const token = makeToken({ institutionId: 'inst-ghost' });
    const res = await request(app)
      .post('/api/procurement/v2/projects')
      .set('Authorization', `Bearer ${token}`)
      .send(validCreateBody);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(procurementEngine.createProjectWithStages).not.toHaveBeenCalled();
  });
});
