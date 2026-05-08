import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/prisma', () => ({
  default: {
    evaluationProject: {
      findFirst: vi.fn(),
    },
    conflictOfInterestDeclaration: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('../../../lib/audit', () => ({
  audit: vi.fn(),
}));

import prisma from '../../../utils/prisma';
import { submitOwnCoi } from '../coi.controller';
import { coiService } from '../coi.service';
import { ForbiddenError, ValidationError } from '../../../utils/errors';

describe('Conflict of Interest controller/service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects non-string declaredText before any coercion or persistence', async () => {
    const submitSpy = vi.spyOn(coiService, 'submit');
    const req = {
      user: { userId: 'u-1', institutionId: 'inst-1' },
      body: {
        declaredText: {
          toString() {
            throw new Error('unexpected coercion');
          },
        },
      },
      params: { id: 'eval-1' },
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn() as unknown as NextFunction;

    await submitOwnCoi(req, res, next);

    expect(submitSpy).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(vi.mocked(next).mock.calls[0]?.[0]).toBeInstanceOf(ValidationError);
  });

  it('scopes submission membership checks to the caller institution', async () => {
    vi.mocked(prisma.evaluationProject.findFirst).mockResolvedValueOnce({
      id: 'eval-1',
      members: [{ id: 'member-1', role: 'evaluator' }],
    } as never);
    vi.mocked(prisma.conflictOfInterestDeclaration.upsert).mockResolvedValueOnce({
      id: 'coi-1',
      evaluationProjectId: 'eval-1',
      userId: 'u-1',
      declaredText: 'none',
      declaredHash: '140bedbf9b0116b47e1f43c7b0f417a84dcf223dac1f66822f455f88c92d5d91',
      signedAt: new Date('2026-05-08T10:00:00.000Z'),
    } as never);

    await coiService.submit({
      evaluationProjectId: 'eval-1',
      userId: 'u-1',
      requestingInstitutionId: 'inst-1',
      declaredText: ' none ',
    });

    expect(prisma.evaluationProject.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'eval-1',
        institutionId: 'inst-1',
      },
      select: {
        id: true,
        members: {
          where: { userId: 'u-1' },
          select: { id: true },
        },
      },
    });
  });

  it('blocks project-wide declaration review for non-leads', async () => {
    vi.mocked(prisma.evaluationProject.findFirst).mockResolvedValueOnce({
      id: 'eval-1',
      members: [{ role: 'evaluator' }],
    } as never);

    await expect(coiService.listForProject('eval-1', 'u-2', 'inst-1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(prisma.conflictOfInterestDeclaration.findMany).not.toHaveBeenCalled();
  });

  it('returns project-wide declarations for the evaluation lead', async () => {
    const rows = [
      {
        id: 'coi-1',
        evaluationProjectId: 'eval-1',
        userId: 'u-2',
        declaredText: 'None declared',
        declaredHash: '648cb0dad5013ff0cfb35bae45d54cbe60d35fd4a1b0987966ab261bf6c485d4',
        signedAt: new Date('2026-05-08T10:00:00.000Z'),
      },
    ];
    vi.mocked(prisma.evaluationProject.findFirst).mockResolvedValueOnce({
      id: 'eval-1',
      members: [{ role: 'lead' }],
    } as never);
    vi.mocked(prisma.conflictOfInterestDeclaration.findMany).mockResolvedValueOnce(rows as never);

    await expect(coiService.listForProject('eval-1', 'u-lead', 'inst-1')).resolves.toEqual(rows);
    expect(prisma.conflictOfInterestDeclaration.findMany).toHaveBeenCalledWith({
      where: { evaluationProjectId: 'eval-1' },
      orderBy: { signedAt: 'desc' },
    });
  });
});
