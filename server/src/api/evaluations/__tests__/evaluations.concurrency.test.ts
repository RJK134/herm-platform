import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvaluationsService } from '../evaluations.service';
import { Prisma } from '@prisma/client';

vi.mock('../../../utils/prisma', () => {
  const evaluationMember = {
    create: vi.fn(),
    findUnique: vi.fn(),
  };
  const evaluationSystem = {
    create: vi.fn(),
    findUnique: vi.fn(),
  };
  return {
    default: {
      evaluationMember,
      evaluationSystem,
    },
  };
});

import prisma from '../../../utils/prisma';

const svc = new EvaluationsService();

function p2002() {
  // Constructor signature differs across Prisma versions; build it via
  // Object.assign so the test doesn't depend on the specific arity.
  const err = Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['projectId', 'userId'] },
  });
  // Tag it so `instanceof PrismaClientKnownRequestError` succeeds.
  Object.setPrototypeOf(err, Prisma.PrismaClientKnownRequestError.prototype);
  return err;
}

describe('EvaluationsService.addMember — race-safe ConflictError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('translates a Prisma P2002 into a ConflictError (double-submit race)', async () => {
    // Regression for audit Gap 4.1: the previous check-then-create
    // leaked P2002 as a 500 under concurrent double-submit. The
    // service now relies on the unique constraint itself and maps the
    // Prisma error back to our normal 409 ConflictError.
    vi.mocked(prisma.evaluationMember.create).mockRejectedValueOnce(p2002());

    await expect(svc.addMember('proj-1', 'user-1', 'evaluator')).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
    // No pre-check findUnique — the unique constraint IS the guard.
    expect(prisma.evaluationMember.findUnique).not.toHaveBeenCalled();
  });

  it('propagates unexpected Prisma errors unchanged', async () => {
    const unrelated = Object.assign(new Error('boom'), {
      code: 'P2025',
      clientVersion: 'test',
    });
    Object.setPrototypeOf(unrelated, Prisma.PrismaClientKnownRequestError.prototype);
    vi.mocked(prisma.evaluationMember.create).mockRejectedValueOnce(unrelated);

    await expect(svc.addMember('proj-1', 'user-1', 'evaluator')).rejects.toMatchObject({
      code: 'P2025',
    });
  });

  it('returns the created row on the happy path', async () => {
    vi.mocked(prisma.evaluationMember.create).mockResolvedValueOnce({
      id: 'mem-1',
      role: 'evaluator',
    } as never);

    const row = await svc.addMember('proj-1', 'user-1', 'evaluator');
    expect(row).toMatchObject({ id: 'mem-1' });
  });
});

describe('EvaluationsService.addSystem — race-safe ConflictError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('translates a Prisma P2002 into a ConflictError', async () => {
    vi.mocked(prisma.evaluationSystem.create).mockRejectedValueOnce(p2002());

    await expect(svc.addSystem('proj-1', 'sys-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
    expect(prisma.evaluationSystem.findUnique).not.toHaveBeenCalled();
  });
});
