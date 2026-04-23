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
  InvalidTransitionError,
  normaliseStatus,
  nextStates,
} from '../../services/domain/procurement/project-status';
import type { ProjectStatus } from '../../services/domain/procurement/project-status';
import { NotFoundError, ValidationError } from '../../utils/errors';

/**
 * Strip reviewer PII from a shortlist entry. The columns removed are
 * `decidedBy` (CUID or display name) and `rationale` (free-text
 * justification that may contain a reviewer's professional opinion or
 * vendor-critical language). `decisionStatus` and `decidedAt` are
 * workflow state + timestamp, not PII, and stay.
 *
 * Callers pass `includeGovernance: !!req.user` to the read methods;
 * anonymous callers get the scrubbed shape, authenticated callers get
 * the full record.
 */
function stripShortlistGovernance<T extends { decidedBy?: string | null; rationale?: string | null }>(
  entry: T,
): T {
  // Explicitly null out — don't strip the keys, so downstream
  // consumers and TypeScript narrow the shape consistently.
  return { ...entry, decidedBy: null, rationale: null };
}

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

  async getProject(id: string, opts: { includeGovernance?: boolean } = {}) {
    const project = await prisma.procurementProject.findUnique({
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
    if (!project) return null;
    if (opts.includeGovernance) return project;
    // Strip reviewer PII (decidedBy) and free-text rationale on the
    // anonymous / public read surface. decisionStatus + decidedAt stay:
    // the workflow state and timestamp are not sensitive.
    return {
      ...project,
      shortlist: project.shortlist.map(stripShortlistGovernance),
    };
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

  async getShortlist(projectId: string, opts: { includeGovernance?: boolean } = {}) {
    const entries = await prisma.shortlistEntry.findMany({
      where: { projectId },
      include: {
        system: { select: { id: true, name: true, vendor: true, category: true } },
      },
      orderBy: { addedAt: 'asc' },
    });
    if (opts.includeGovernance) return entries;
    return entries.map(stripShortlistGovernance);
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
   * entry with `userId` on the row itself and `changes` carrying
   * `{from, to, note, actorName}` so reviewers can see the history even
   * though the `status` column itself is a point-in-time scalar.
   */
  async transitionStatus(
    projectId: string,
    data: TransitionProjectInput,
    actor?: { userId?: string; name?: string },
  ) {
    // Use a callback transaction so the read, validation, and write all
    // share one snapshot — a concurrent request that flips the status
    // between our read and write can no longer overwrite the transition
    // (the conditional `updateMany` will see a stale `from` and return
    // `count: 0`, and we retry the read once to synthesise a fresh
    // InvalidTransitionError against the now-current state).
    return prisma.$transaction(async (tx) => {
      const project = await tx.procurementProject.findUnique({
        where: { id: projectId },
        select: { id: true, status: true },
      });
      if (!project) throw new NotFoundError(`Project not found: ${projectId}`);

      const rawFrom = project.status;
      const { from, to } = assertTransition(rawFrom, data.to);

      // Conditional update: only flip the row if its status is still the
      // value we read. Guards against TOCTOU races where a concurrent
      // transition landed between our read and write.
      const res = await tx.procurementProject.updateMany({
        where: { id: projectId, status: rawFrom },
        data: { status: to },
      });
      if (res.count !== 1) {
        // Someone else transitioned us in the meantime. Re-read and
        // surface the authoritative current state as an
        // InvalidTransitionError so the client retries against the new
        // state rather than silently succeeding.
        const latest = await tx.procurementProject.findUnique({
          where: { id: projectId },
          select: { status: true },
        });
        throw new InvalidTransitionError(
          normaliseStatus(latest?.status),
          data.to,
        );
      }

      await tx.auditLog.create({
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
      });

      const updated = await tx.procurementProject.findUnique({
        where: { id: projectId },
      });

      return {
        project: updated,
        transition: { from, to, note: data.note ?? null },
        nextStates: nextStates(to),
      };
    });
  }

  /**
   * Expose the workflow metadata the client needs to render a state pill.
   *
   * `includeActor` controls whether each history row carries `actorId`
   * and `actorName`. Unauthenticated callers get `null` for both so a
   * public dashboard can still render the sequence of transitions
   * without leaking reviewer identity.
   */
  async getStatusContext(
    projectId: string,
    opts: { includeActor?: boolean } = {},
  ): Promise<{
    current: ProjectStatus;
    next: readonly ProjectStatus[];
    history: Array<{
      at: Date;
      actorId: string | null;
      actorName: string | null;
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
        // `changes` carries {from, to, note, actorName} — parse defensively
        // in case older rows are missing fields.
        const c = (l.changes ?? {}) as {
          from?: string;
          to?: string;
          note?: string | null;
          actorName?: string | null;
        };
        return {
          at: l.createdAt,
          actorId: opts.includeActor ? (l.userId ?? null) : null,
          actorName: opts.includeActor ? (c.actorName ?? null) : null,
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
   *
   * Scoped by BOTH `projectId` and `entryId` so an entry belonging to a
   * different project can't be decided on via a mis-routed URL. Returns
   * 404 if the entry doesn't belong to the named project.
   */
  async decideShortlistEntry(
    projectId: string,
    entryId: string,
    data: DecideShortlistInput,
    actor?: { userId?: string; name?: string },
  ) {
    const entry = await prisma.shortlistEntry.findFirst({
      where: { id: entryId, projectId },
    });
    if (!entry) {
      throw new NotFoundError(
        `Shortlist entry not found: ${entryId} (project ${projectId})`,
      );
    }

    // Guard against weird inputs — the Zod schema already restricts
    // `decisionStatus`, but we belt-and-brace here so callers that wire
    // the service directly (tests, other servers) can't smuggle in
    // arbitrary statuses.
    if (data.decisionStatus !== 'approved' && data.decisionStatus !== 'rejected') {
      throw new ValidationError(
        `decisionStatus must be 'approved' or 'rejected', got '${data.decisionStatus}'`,
      );
    }

    // Reviewer attribution comes from the JWT (authenticateJWT is required
    // on this route). A non-empty `actor.name` wins; otherwise fall back
    // to `actor.userId`. We explicitly reject empty-string names so a
    // malformed JWT can't store `decidedBy: ''`.
    const decidedBy =
      (actor?.name && actor.name.trim().length > 0 ? actor.name.trim() : null) ??
      actor?.userId ??
      null;

    return prisma.shortlistEntry.update({
      where: { id: entryId },
      data: {
        decisionStatus: data.decisionStatus,
        rationale: data.rationale,
        decidedBy,
        decidedAt: new Date(),
      },
      include: {
        system: { select: { id: true, name: true, vendor: true, category: true } },
      },
    });
  }

  /**
   * Reset a decision back to `pending`. Used when shortlist is revised.
   * Scoped by `(projectId, entryId)` for the same tenant-isolation
   * reason as `decideShortlistEntry`.
   */
  async clearShortlistDecision(projectId: string, entryId: string) {
    const entry = await prisma.shortlistEntry.findFirst({
      where: { id: entryId, projectId },
    });
    if (!entry) {
      throw new NotFoundError(
        `Shortlist entry not found: ${entryId} (project ${projectId})`,
      );
    }

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
