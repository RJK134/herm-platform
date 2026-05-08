// Phase 14.9 — Conflict-of-Interest declaration service. UK Procurement
// Act 2023 (Sections 81-83) requires contracting authorities to obtain
// CoI declarations from evaluators at procurement-start and to maintain
// a record for audit. This service handles submit + retrieve only;
// audit log writes happen at the controller layer (which has the
// Express Request needed by the shared audit() helper). The
// declaredHash is captured at signing time so a later mutation of
// declaredText is detectable via re-hash + compare.

import { createHash } from 'node:crypto';
import prisma from '../../utils/prisma';
import { NotFoundError, ValidationError } from '../../utils/errors';

export interface SubmitCoiInput {
  evaluationProjectId: string;
  userId: string;
  declaredText: string;
}

export interface CoiDeclarationView {
  id: string;
  evaluationProjectId: string;
  userId: string;
  declaredText: string;
  declaredHash: string;
  signedAt: Date;
}

export function hashCoiDeclaration(text: string): string {
  // SHA-256 of the canonical (trimmed) declaration text. Hash is stored
  // alongside the row so any later mutation of declaredText is
  // detectable via re-hash + compare. Trimming first means whitespace-
  // only edits don't accidentally invalidate the audit trail.
  return createHash('sha256').update(text.trim()).digest('hex');
}

export class CoiService {
  async submit(input: SubmitCoiInput): Promise<CoiDeclarationView> {
    // Confirm the project exists and the user is allowed to declare for
    // it (must be a member of the evaluation). Both checks done in one
    // round-trip via the membership join.
    const project = await prisma.evaluationProject.findUnique({
      where: { id: input.evaluationProjectId },
      select: {
        id: true,
        institutionId: true,
        members: {
          where: { userId: input.userId },
          select: { id: true, role: true },
        },
      },
    });
    if (!project) {
      throw new NotFoundError('Evaluation project not found');
    }
    if (project.members.length === 0) {
      throw new ValidationError(
        'Only evaluation members may submit a Conflict of Interest declaration. Add the user as a member first.',
      );
    }

    const declaredText = input.declaredText.trim();
    const declaredHash = hashCoiDeclaration(declaredText);

    return prisma.conflictOfInterestDeclaration.upsert({
      where: {
        evaluationProjectId_userId: {
          evaluationProjectId: input.evaluationProjectId,
          userId: input.userId,
        },
      },
      update: { declaredText, declaredHash, signedAt: new Date() },
      create: {
        evaluationProjectId: input.evaluationProjectId,
        userId: input.userId,
        declaredText,
        declaredHash,
      },
    });
  }

  async getMine(evaluationProjectId: string, userId: string): Promise<CoiDeclarationView | null> {
    return prisma.conflictOfInterestDeclaration.findUnique({
      where: {
        evaluationProjectId_userId: { evaluationProjectId, userId },
      },
    });
  }

  async listForProject(evaluationProjectId: string): Promise<CoiDeclarationView[]> {
    return prisma.conflictOfInterestDeclaration.findMany({
      where: { evaluationProjectId },
      orderBy: { signedAt: 'desc' },
    });
  }
}

export const coiService = new CoiService();
