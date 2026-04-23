import type {
  CreateProjectInput,
  UpdateProjectInput,
  UpdateStageInput,
  AddShortlistEntryInput,
  UpdateShortlistEntryInput,
  TransitionProjectInput,
  DecideShortlistInput,
} from './procurement.schema';
import prisma from '../../utils/prisma';
import {
  assertTransition,
  normaliseStatus,
  nextStates,
} from '../../services/domain/procurement/project-status';
import type { ProjectStatus } from '../../services/domain/procurement/project-status';
import { NotFoundError, ValidationError } from '../../utils/errors';

const WORKFLOW_STAGES = [
  { stageNumber: 1, title: 'Requirements Definition', status: 'active' },
  { stageNumber: 2, title: 'Market Engagement', status: 'pending' },
  { stageNumber: 3, title: 'Long List', status: 'pending' },
  { stageNumber: 4, title: 'Short List', status: 'pending' },
  { stageNumber: 5, title: 'ITT / RFP Issuance', status: 'pending' },
  { stageNumber: 6, title: 'Evaluation & Scoring', status: 'pending' },
  { stageNumber: 7, title: 'Preferred Supplier', status: 'pending' },
  { stageNumber: 8, title: 'Contract Award', status: 'pending' },
] as const;

async function ensureDefaultInstitution(): Promise<string> {
  const existing = await prisma.institution.findFirst({
    where: { slug: 'default' },
  });
  if (existing) return existing.id;

  const created = await prisma.institution.create({
    data: {
      name: 'Default Institution',
      slug: 'default',
      country: 'UK',
      tier: 'free',
    },
  });
  return created.id;
}

export class ProcurementService {
  async createProject(data: CreateProjectInput) {
    const institutionId = data.institutionId ?? (await ensureDefaultInstitution());

    return prisma.$transaction(async (tx) => {
      const project = await tx.procurementProject.create({
        data: {
          name: data.name,
          institutionId,
          jurisdiction: data.jurisdiction ?? 'UK',
          basketId: data.basketId ?? null,
          // Phase 3 state machine: new projects start in `draft`. The
          // previous default of `active` is mapped to `active_review`
          // for historical rows by `normaliseStatus()`.
          status: 'draft',
        },
      });

      await tx.procurementWorkflow.create({
        data: {
          projectId: project.id,
          currentStage: 1,
          stages: {
            create: WORKFLOW_STAGES.map((s) => ({
              stageNumber: s.stageNumber,
              title: s.title,
              status: s.status,
            })),
          },
        },
      });

      return project;
    });
  }

  async listProjects() {
    return prisma.procurementProject.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        workflow: { select: { currentStage: true } },
        _count: { select: { shortlist: true } },
      },
    });
  }

  async getProject(id: string) {
    return prisma.procurementProject.findUnique({
      where: { id },
      include: {
        workflow: {
          include: {
            stages: { orderBy: { stageNumber: 'asc' } },
          },
        },
        shortlist: {
          include: {
            system: { select: { id: true, name: true, vendor: true, category: true } },
          },
          orderBy: { addedAt: 'asc' },
        },
      },
    });
  }

  async updateProject(id: string, data: UpdateProjectInput) {
    return prisma.procurementProject.update({
      where: { id },
      data,
    });
  }

  async deleteProject(id: string) {
    return prisma.procurementProject.delete({ where: { id } });
  }

  async getWorkflow(projectId: string) {
    return prisma.procurementWorkflow.findUnique({
      where: { projectId },
      include: { stages: { orderBy: { stageNumber: 'asc' } } },
    });
  }

  async updateStage(projectId: string, stageNum: number, data: UpdateStageInput) {
    const workflow = await prisma.procurementWorkflow.findUnique({
      where: { projectId },
    });
    if (!workflow) throw new Error('Workflow not found');

    const updateData: {
      status?: string;
      notes?: string;
      outputs?: import('@prisma/client').Prisma.InputJsonValue;
      completedAt?: Date;
    } = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.outputs !== undefined) {
      updateData.outputs = data.outputs as import('@prisma/client').Prisma.InputJsonValue;
    }
    if (data.status === 'complete') updateData.completedAt = new Date();

    return prisma.workflowStage.update({
      where: {
        workflowId_stageNumber: {
          workflowId: workflow.id,
          stageNumber: stageNum,
        },
      },
      data: updateData,
    });
  }

  async advanceWorkflow(projectId: string) {
    const workflow = await prisma.procurementWorkflow.findUnique({
      where: { projectId },
      include: { stages: true },
    });
    if (!workflow) throw new Error('Workflow not found');

    const currentStage = workflow.currentStage;
    if (currentStage >= 8) {
      throw new Error('Workflow is already at the final stage');
    }

    const nextStage = currentStage + 1;

    return prisma.$transaction(async (tx) => {
      // Mark current stage as complete
      await tx.workflowStage.update({
        where: {
          workflowId_stageNumber: {
            workflowId: workflow.id,
            stageNumber: currentStage,
          },
        },
        data: { status: 'complete', completedAt: new Date() },
      });

      // Activate next stage
      await tx.workflowStage.update({
        where: {
          workflowId_stageNumber: {
            workflowId: workflow.id,
            stageNumber: nextStage,
          },
        },
        data: { status: 'active' },
      });

      // Update workflow current stage
      return tx.procurementWorkflow.update({
        where: { id: workflow.id },
        data: { currentStage: nextStage },
        include: { stages: { orderBy: { stageNumber: 'asc' } } },
      });
    });
  }

  async addShortlistEntry(projectId: string, data: AddShortlistEntryInput) {
    return prisma.shortlistEntry.create({
      data: {
        projectId,
        systemId: data.systemId,
        status: data.status ?? 'longlist',
        notes: data.notes ?? null,
        score: data.score ?? null,
      },
      include: {
        system: { select: { id: true, name: true, vendor: true, category: true } },
      },
    });
  }

  async getShortlist(projectId: string) {
    return prisma.shortlistEntry.findMany({
      where: { projectId },
      include: {
        system: { select: { id: true, name: true, vendor: true, category: true } },
      },
      orderBy: { addedAt: 'asc' },
    });
  }

  async updateShortlistEntry(entryId: string, data: UpdateShortlistEntryInput) {
    return prisma.shortlistEntry.update({
      where: { id: entryId },
      data,
      include: {
        system: { select: { id: true, name: true, vendor: true, category: true } },
      },
    });
  }

  async removeShortlistEntry(entryId: string) {
    return prisma.shortlistEntry.delete({ where: { id: entryId } });
  }

  // ── Phase 3: status state machine ─────────────────────────────────────────

  /**
   * Apply a governance-controlled status transition. Records an AuditLog
   * entry capturing `{from, to, note, actorId}` so reviewers can see the
   * history even though the `status` column itself is a point-in-time
   * scalar.
   */
  async transitionStatus(
    projectId: string,
    data: TransitionProjectInput,
    actor?: { userId?: string; name?: string },
  ) {
    const project = await prisma.procurementProject.findUnique({
      where: { id: projectId },
      select: { id: true, status: true },
    });
    if (!project) throw new NotFoundError(`Project not found: ${projectId}`);

    const { from, to } = assertTransition(project.status, data.to);

    // Persist transition + audit log atomically so readers never see a
    // new status without its corresponding audit entry.
    const [updated] = await prisma.$transaction([
      prisma.procurementProject.update({
        where: { id: projectId },
        data: { status: to },
      }),
      prisma.auditLog.create({
        data: {
          userId: actor?.userId ?? null,
          action: 'procurement.project.transition',
          entityType: 'ProcurementProject',
          entityId: projectId,
          changes: {
            from,
            to,
            note: data.note ?? null,
            actorName: actor?.name ?? null,
          },
        },
      }),
    ]);

    return {
      project: updated,
      transition: { from, to, note: data.note ?? null },
      nextStates: nextStates(to),
    };
  }

  /** Expose the workflow metadata the client needs to render a state pill. */
  async getStatusContext(projectId: string): Promise<{
    current: ProjectStatus;
    next: readonly ProjectStatus[];
    history: Array<{
      at: Date;
      actorId: string | null;
      from: ProjectStatus;
      to: ProjectStatus;
      note: string | null;
    }>;
  }> {
    const project = await prisma.procurementProject.findUnique({
      where: { id: projectId },
      select: { status: true },
    });
    if (!project) throw new NotFoundError(`Project not found: ${projectId}`);

    const logs = await prisma.auditLog.findMany({
      where: {
        entityType: 'ProcurementProject',
        entityId: projectId,
        action: 'procurement.project.transition',
      },
      orderBy: { createdAt: 'asc' },
    });

    const current = normaliseStatus(project.status);
    return {
      current,
      next: nextStates(current),
      history: logs.map((l) => {
        const c = (l.changes ?? {}) as {
          from?: string;
          to?: string;
          note?: string | null;
        };
        return {
          at: l.createdAt,
          actorId: l.userId ?? null,
          from: normaliseStatus(c.from),
          to: normaliseStatus(c.to),
          note: c.note ?? null,
        };
      }),
    };
  }

  // ── Phase 3: shortlist decisions ─────────────────────────────────────────

  /**
   * Record an approve/reject decision against a shortlist entry. Unlike
   * `updateShortlistEntry`, this is the canonical governance surface —
   * rationale is mandatory, and both actor attribution and `decidedAt`
   * are stamped server-side.
   */
  async decideShortlistEntry(
    entryId: string,
    data: DecideShortlistInput,
    actor?: { userId?: string; name?: string },
  ) {
    const entry = await prisma.shortlistEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundError(`Shortlist entry not found: ${entryId}`);

    // Guard against weird inputs — the Zod schema already restricts
    // `decisionStatus`, but we belt-and-brace here so callers that wire
    // the service directly (tests, other servers) can't smuggle in
    // arbitrary statuses.
    if (data.decisionStatus !== 'approved' && data.decisionStatus !== 'rejected') {
      throw new ValidationError(
        `decisionStatus must be 'approved' or 'rejected', got '${data.decisionStatus}'`,
      );
    }

    return prisma.shortlistEntry.update({
      where: { id: entryId },
      data: {
        decisionStatus: data.decisionStatus,
        rationale: data.rationale,
        decidedBy: actor?.name ?? actor?.userId ?? data.decidedBy ?? null,
        decidedAt: new Date(),
      },
      include: {
        system: { select: { id: true, name: true, vendor: true, category: true } },
      },
    });
  }

  /** Reset a decision back to `pending`. Used when shortlist is revised. */
  async clearShortlistDecision(entryId: string) {
    const entry = await prisma.shortlistEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundError(`Shortlist entry not found: ${entryId}`);

    return prisma.shortlistEntry.update({
      where: { id: entryId },
      data: {
        decisionStatus: 'pending',
        rationale: null,
        decidedBy: null,
        decidedAt: null,
      },
      include: {
        system: { select: { id: true, name: true, vendor: true, category: true } },
      },
    });
  }
}
