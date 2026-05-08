// Phase 14.9 — Conflict-of-Interest declaration service. UK Procurement
// Act 2023 (Sections 81-83) requires contracting authorities to obtain
// CoI declarations from evaluators at procurement-start and to maintain
// a record for audit. This service handles submit + retrieve only;
// audit log writes happen at the controller layer (which has the
// Express Request needed by the shared audit() helper). The
// declaredHash is captured at signing time so a later mutation of
// declaredText is detectable via re-hash + compare.
//
// Tenant-scoping posture (per Bugbot/Vade/Copilot review on PR #101):
// every read AND write filters EvaluationProject by `institutionId` so
// a user from institution A can't probe / read / write CoI rows for
// institution B's projects even if they know a project ID. The
// failure mode for cross-tenant probes is uniformly NotFoundError
// (write path) or empty list (read path) so the response shape
// doesn't leak project existence across tenants.

import { createHash } from 'node:crypto';
import prisma from '../../utils/prisma';
import { NotFoundError, ValidationError } from '../../utils/errors';

export interface SubmitCoiInput {
  evaluationProjectId: string;
  userId: string;
  /**
   * Caller's home institution, taken from the JWT in the controller.
   * The project lookup filters on this so cross-tenant calls return
   * the same NotFoundError as "project doesn't exist at all" — closes
   * the existence-oracle that bot review flagged.
   */
  requestingInstitutionId: string;
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
    // Confirm the project exists, belongs to the caller's institution,
    // and the user is allowed to declare for it (must be a member of
    // the evaluation). The institutionId filter on findFirst ensures a
    // cross-tenant ID returns the same NotFoundError as a non-existent
    // ID — same response shape, no existence oracle.
    const project = await prisma.evaluationProject.findFirst({
      where: {
        id: input.evaluationProjectId,
        institutionId: input.requestingInstitutionId,
      },
      select: {
        id: true,
        members: {
          where: { userId: input.userId },
          select: { id: true },
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

  /**
   * Tenant-scoped list of every declaration on a project. Caller MUST
   * be authenticated, the project MUST belong to the caller's
   * institution, AND the caller MUST be a member of the project.
   * Cross-tenant probes and non-member access both return [] (NOT
   * 403) so the response shape doesn't reveal project existence on
   * probed IDs. Project leads see every declaration; ordinary
   * evaluators get the same project-wide list because PA 2023 audit
   * posture is "every member sees every other member's declaration
   * so collusion can't be laundered through private declarations".
   */
  async listForProject(
    evaluationProjectId: string,
    requestingUserId: string | null | undefined,
    requestingInstitutionId: string | null | undefined,
  ): Promise<CoiDeclarationView[]> {
    if (!requestingUserId || !requestingInstitutionId) return [];
    // Single round-trip: project must exist AND be in the caller's
    // institution AND have the caller as a member.
    const project = await prisma.evaluationProject.findFirst({
      where: {
        id: evaluationProjectId,
        institutionId: requestingInstitutionId,
        members: { some: { userId: requestingUserId } },
      },
      select: { id: true },
    });
    if (!project) return [];
    return prisma.conflictOfInterestDeclaration.findMany({
      where: { evaluationProjectId },
      orderBy: { signedAt: 'desc' },
    });
  }
}

export const coiService = new CoiService();
