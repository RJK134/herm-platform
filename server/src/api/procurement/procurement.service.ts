import type {
  CreateProjectInput,
  UpdateProjectInput,
  UpdateStageInput,
  AddShortlistEntryInput,
  UpdateShortlistEntryInput,
  TransitionProjectInput,
  DecideShortlistInput,
  SeedShortlistFromBasketInput,
} from './procurement.schema';
import prisma from '../../utils/prisma';
import { BasketsService } from '../baskets/baskets.service';
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

/**
 * Canonical reviewer-attribution normalisation: trim whitespace,
 * reject empty-string names, fall back to `userId`, then null. Used by
 * every governance surface (status transitions, shortlist decisions,
 * decision clears) so the audit log and the on-row `decidedBy` column
 * agree on what a reviewer's name looks like — no trailing-space
 * "Alice " here, "Alice" there.
 */
function normaliseActorName(actor?: { userId?: string; name?: string }): string | null {
  const trimmed = actor?.name?.trim();
  if (trimmed && trimmed.length > 0) return trimmed;
  return actor?.userId ?? null;
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

const MIN_BASKET_IMPORT_LIMIT = 1;
const DEFAULT_BASKET_IMPORT_LIMIT = 5;
const MAX_BASKET_IMPORT_LIMIT = 10;
const BASKET_IMPORT_NOTE = 'Imported from linked capability basket evaluation';
const SCORE_PRECISION_MULTIPLIER = 10;

function priorityMultiplier(priority: string): number {
  switch (priority) {
    case 'must':
      return 3;
    case 'should':
      return 2;
    case 'could':
      return 1;
    default:
      return 0;
  }
}

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

  async getShortlistSystems(projectId: string) {
    const entries = await prisma.shortlistEntry.findMany({
      where: {
        projectId,
        status: { in: ['shortlist', 'preferred'] },
      },
      include: {
        system: { select: { id: true, name: true, vendor: true, category: true } },
      },
      orderBy: [{ score: 'desc' }, { addedAt: 'asc' }],
    });

    return entries.map((entry) => ({
      id: entry.system.id,
      name: entry.system.name,
      vendor: entry.system.vendor,
      category: entry.system.category,
      status: entry.status,
      score: entry.score,
      shortlistEntryId: entry.id,
    }));
  }

  async importBasketToShortlist(projectId: string, opts: { limit?: number } = {}) {
    const limit = Math.max(
      MIN_BASKET_IMPORT_LIMIT,
      Math.min(opts.limit ?? DEFAULT_BASKET_IMPORT_LIMIT, MAX_BASKET_IMPORT_LIMIT),
    );

    const project = await prisma.procurementProject.findUnique({
      where: { id: projectId },
      select: { id: true, basketId: true },
    });
    if (!project) throw new NotFoundError(`Project not found: ${projectId}`);
    if (!project.basketId) {
      throw new ValidationError('Project does not have a linked capability basket');
    }

    const basket = await prisma.capabilityBasket.findUnique({
      where: { id: project.basketId },
      include: { items: true },
    });
    if (!basket) throw new NotFoundError(`Basket not found: ${project.basketId}`);
    if (basket.items.length === 0) {
      return { importedCount: 0, entries: await this.getShortlistSystems(projectId) };
    }

    const capabilityIds = basket.items.map((item) => item.capabilityId);
    const [systems, allScores, existingEntries] = await Promise.all([
      prisma.vendorSystem.findMany(),
      prisma.capabilityScore.findMany({
        where: {
          capabilityId: { in: capabilityIds },
          version: 1,
          ...(basket.frameworkId ? { frameworkId: basket.frameworkId } : {}),
        },
      }),
      prisma.shortlistEntry.findMany({
        where: { projectId },
        select: { id: true, systemId: true, status: true, score: true },
      }),
    ]);

    const scoreIndex = new Map<string, Map<string, number>>();
    for (const score of allScores) {
      if (!scoreIndex.has(score.systemId)) scoreIndex.set(score.systemId, new Map());
      scoreIndex.get(score.systemId)!.set(score.capabilityId, score.value);
    }

    const ranked = systems
      .map((system) => {
        const systemScores = scoreIndex.get(system.id) ?? new Map<string, number>();
        let weightedScore = 0;
        let weightedMax = 0;

        for (const item of basket.items) {
          const score = systemScores.get(item.capabilityId) ?? 0;
          const effectiveWeight = item.weight * priorityMultiplier(item.priority);
          weightedScore += (score / 100) * effectiveWeight;
          weightedMax += effectiveWeight;
        }

        const percentage = weightedMax > 0 ? (weightedScore / weightedMax) * 100 : 0;

        return {
          systemId: system.id,
          score: Math.round(percentage * SCORE_PRECISION_MULTIPLIER) / SCORE_PRECISION_MULTIPLIER,
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const existingBySystemId = new Map(
      existingEntries.map((entry) => [entry.systemId, entry]),
    );

    let importedCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const candidate of ranked) {
        const existing = existingBySystemId.get(candidate.systemId);
        if (!existing) {
          importedCount += 1;
          await tx.shortlistEntry.create({
            data: {
              projectId,
              systemId: candidate.systemId,
              status: 'shortlist',
              score: candidate.score,
              notes: BASKET_IMPORT_NOTE,
            },
          });
          continue;
        }

        const nextStatus = existing.status === 'longlist' ? 'shortlist' : existing.status;
        if (nextStatus !== existing.status || existing.score !== candidate.score) {
          await tx.shortlistEntry.update({
            where: { id: existing.id },
            data: {
              status: nextStatus,
              score: candidate.score,
            },
          });
        }
      }
    });

    return {
      importedCount,
      entries: await this.getShortlistSystems(projectId),
    };
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
        // Someone else transitioned (or deleted) us in the meantime.
        // Re-read the authoritative current state. If the project is
        // gone, surface a NotFoundError — reporting a misleading
        // "cannot transition from 'draft' to …" against a deleted row
        // would send the client retrying forever.
        const latest = await tx.procurementProject.findUnique({
          where: { id: projectId },
          select: { status: true },
        });
        if (!latest) {
          throw new NotFoundError(`Project not found: ${projectId}`);
        }
        throw new InvalidTransitionError(
          normaliseStatus(latest.status),
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
            actorName: normaliseActorName(actor),
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
    // Guard against weird inputs — the Zod schema already restricts
    // `decisionStatus`, but we belt-and-brace here so callers that wire
    // the service directly (tests, other servers) can't smuggle in
    // arbitrary statuses.
    if (data.decisionStatus !== 'approved' && data.decisionStatus !== 'rejected') {
      throw new ValidationError(
        `decisionStatus must be 'approved' or 'rejected', got '${data.decisionStatus}'`,
      );
    }

    const decidedBy = normaliseActorName(actor);
    const decidedAt = new Date();

    // Callback transaction so the read of the PRIOR state, the update,
    // and the audit-log row share one snapshot. Without this, a
    // concurrent decision landing between our read and our write would
    // cause the audit log to record a stale `previous` block.
    return prisma.$transaction(async (tx) => {
      const entry = await tx.shortlistEntry.findFirst({
        where: { id: entryId, projectId },
      });
      if (!entry) {
        throw new NotFoundError(
          `Shortlist entry not found: ${entryId} (project ${projectId})`,
        );
      }

      const updated = await tx.shortlistEntry.update({
        where: { id: entryId },
        data: {
          decisionStatus: data.decisionStatus,
          rationale: data.rationale,
          decidedBy,
          decidedAt,
        },
        include: {
          system: { select: { id: true, name: true, vendor: true, category: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actor?.userId ?? null,
          action: 'procurement.shortlist.decision',
          entityType: 'ShortlistEntry',
          entityId: entryId,
          changes: {
            projectId,
            systemId: entry.systemId,
            previous: {
              decisionStatus: entry.decisionStatus,
              rationale: entry.rationale,
              decidedBy: entry.decidedBy,
              decidedAt: entry.decidedAt ? entry.decidedAt.toISOString() : null,
            },
            next: {
              decisionStatus: data.decisionStatus,
              rationale: data.rationale,
              decidedBy,
              decidedAt: decidedAt.toISOString(),
            },
            actorName: decidedBy,
          },
        },
      });

      return updated;
    });
  }

  /**
   * Reset a decision back to `pending`. Used when shortlist is revised.
   * Scoped by `(projectId, entryId)` for the same tenant-isolation
   * reason as `decideShortlistEntry`.
   *
   * Writes an AuditLog row before clearing so the prior reviewer,
   * rationale, and decision timestamp survive even though the
   * corresponding columns on `ShortlistEntry` are now `null`. This is
   * the exact "unrecoverable governance gap" Phase 3 exists to close.
   */
  async clearShortlistDecision(
    projectId: string,
    entryId: string,
    actor?: { userId?: string; name?: string },
  ) {
    const actorName = normaliseActorName(actor);

    return prisma.$transaction(async (tx) => {
      const entry = await tx.shortlistEntry.findFirst({
        where: { id: entryId, projectId },
      });
      if (!entry) {
        throw new NotFoundError(
          `Shortlist entry not found: ${entryId} (project ${projectId})`,
        );
      }

      const updated = await tx.shortlistEntry.update({
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

      await tx.auditLog.create({
        data: {
          userId: actor?.userId ?? null,
          action: 'procurement.shortlist.decision.clear',
          entityType: 'ShortlistEntry',
          entityId: entryId,
          changes: {
            projectId,
            systemId: entry.systemId,
            previous: {
              decisionStatus: entry.decisionStatus,
              rationale: entry.rationale,
              decidedBy: entry.decidedBy,
              decidedAt: entry.decidedAt ? entry.decidedAt.toISOString() : null,
            },
            actorName,
          },
        },
      });

      return updated;
    });
  }

  // ── Phase 4: basket-to-shortlist seeding ───────────────────────────────

  /**
   * Seed a project's shortlist from its linked basket.
   *
   * The basket is evaluated (priority × weight per capability, framework-
   * scoped) and the resulting per-system match percentage is stored as
   * `ShortlistEntry.score`. Entries are created as `longlist` /
   * `pending` so every seeded system still has to go through the Phase 3
   * decision governance flow before it's promoted.
   *
   * Safe to call repeatedly: dedupes against the existing
   * `@@unique(projectId, systemId)` constraint via `skipDuplicates`, and
   * the AuditLog row captures both the number of newly-added entries and
   * the full evaluated ranking so a second seed after basket changes is
   * fully reconstructable.
   */
  async seedShortlistFromBasket(
    projectId: string,
    opts: SeedShortlistFromBasketInput,
    actor?: { userId?: string; name?: string },
  ) {
    const project = await prisma.procurementProject.findUnique({
      where: { id: projectId },
      select: { id: true, basketId: true },
    });
    if (!project) throw new NotFoundError(`Project not found: ${projectId}`);
    if (!project.basketId) {
      throw new ValidationError(
        'Project has no linked basket; set `basketId` on the project first',
      );
    }

    const basketsService = new BasketsService();
    const ranking = await basketsService.evaluateBasket(project.basketId);

    if (ranking.length === 0) {
      // Basket has no items — nothing to evaluate. Return early with an
      // empty result; don't write an audit row for a no-op.
      return { added: 0, skipped: 0, ranking: [] as typeof ranking, entries: [] };
    }

    const minPercentage = opts.minPercentage ?? 0;
    const filtered = ranking.filter((r) => r.percentage >= minPercentage);
    const capped =
      opts.topN !== undefined ? filtered.slice(0, opts.topN) : filtered;

    return prisma.$transaction(async (tx) => {
      // Read the existing shortlist INSIDE the transaction and compute
      // the "add" set from that snapshot. Doing the read outside would
      // let a concurrent seed land between read and createMany; the
      // `skipDuplicates: true` call would silently drop the dup but
      // the audit counts below would overstate `added`.
      const existing = await tx.shortlistEntry.findMany({
        where: { projectId },
        select: { systemId: true },
      });
      const existingSystemIds = new Set(existing.map((e) => e.systemId));

      const toAdd = capped.filter((r) => !existingSystemIds.has(r.system.id));

      // Authoritative `added` count comes from createMany's result so
      // a sibling transaction that snuck an overlapping row in before
      // our createMany is still reflected correctly in the audit log.
      let added = 0;
      if (toAdd.length > 0) {
        const created = await tx.shortlistEntry.createMany({
          data: toAdd.map((r) => ({
            projectId,
            systemId: r.system.id,
            status: 'longlist',
            score: r.percentage,
          })),
          // Belt-and-braces: @@unique(projectId, systemId) means a race
          // that adds a row between our SELECT and INSERT would otherwise
          // throw P2002. skipDuplicates keeps the seed idempotent.
          skipDuplicates: true,
        });
        added = created.count;
      }
      const skippedAlreadyOnShortlist = capped.length - added;

      await tx.auditLog.create({
        data: {
          userId: actor?.userId ?? null,
          action: 'procurement.shortlist.seed',
          entityType: 'ProcurementProject',
          entityId: projectId,
          changes: {
            basketId: project.basketId,
            opts: {
              topN: opts.topN ?? null,
              minPercentage: opts.minPercentage ?? null,
            },
            added,
            skippedAlreadyOnShortlist,
            // Persist the ranking so someone auditing the seed later can
            // see exactly which scores the decision was based on, even
            // if the basket is edited afterwards.
            ranking: ranking.map((r) => ({
              systemId: r.system.id,
              systemName: r.system.name,
              percentage: r.percentage,
              rank: r.rank,
            })),
            actorName: normaliseActorName(actor),
          },
        },
      });

      const entries = await tx.shortlistEntry.findMany({
        where: { projectId },
        include: {
          system: { select: { id: true, name: true, vendor: true, category: true } },
        },
        orderBy: { score: 'desc' },
      });

      return {
        added,
        skipped: skippedAlreadyOnShortlist,
        ranking,
        entries: entries.map(stripShortlistGovernance),
      };
    });
  }
}
