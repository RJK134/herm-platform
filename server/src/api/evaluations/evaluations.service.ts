import { Prisma } from '@prisma/client';
import prisma from '../../utils/prisma';
import { NotFoundError, ConflictError } from '../../utils/errors';
import type {
  CreateEvaluationProjectInput,
  UpdateEvaluationProjectInput,
  AssignDomainsInput,
  SubmitDomainScoresInput,
} from './evaluations.schema';

export class EvaluationsService {
  async createProject(data: CreateEvaluationProjectInput, institutionId: string, leadUserId: string) {
    const project = await prisma.$transaction(async (tx) => {
      const proj = await tx.evaluationProject.create({
        data: {
          name: data.name,
          description: data.description,
          // `institutionId` is always the caller's JWT tenant. The
          // schema no longer accepts it from the body, so there is no
          // override path.
          institutionId,
          leadUserId,
          basketId: data.basketId,
          deadline: data.deadline ? new Date(data.deadline) : undefined,
          status: 'planning',
        },
      });

      // Add systems
      await tx.evaluationSystem.createMany({
        data: data.systemIds.map(systemId => ({ projectId: proj.id, systemId })),
        skipDuplicates: true,
      });

      // Add lead as member
      await tx.evaluationMember.create({
        data: { projectId: proj.id, userId: leadUserId, role: 'lead' },
      });

      // Add additional members by email
      if (data.memberEmails && data.memberEmails.length > 0) {
        const users = await tx.user.findMany({
          where: { email: { in: data.memberEmails } },
          select: { id: true, email: true },
        });
        if (users.length > 0) {
          await tx.evaluationMember.createMany({
            data: users
              .filter(u => u.id !== leadUserId)
              .map(u => ({ projectId: proj.id, userId: u.id, role: 'evaluator' })),
            skipDuplicates: true,
          });
        }
      }

      return proj;
    });

    return this.getProject(project.id, institutionId);
  }

  async listProjects(institutionId: string) {
    const projects = await prisma.evaluationProject.findMany({
      where: { institutionId },
      include: {
        _count: { select: { members: true, systems: true, domainAssignments: true } },
        systems: {
          include: { system: { select: { id: true, name: true, vendor: true, logoUrl: true } } },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return projects.map(p => {
      const completed = 0; // computed from domainAssignments status in getProject
      return {
        ...p,
        memberCount: p._count.members,
        systemCount: p._count.systems,
        domainCount: p._count.domainAssignments,
        progress: p._count.domainAssignments > 0
          ? Math.round((completed / p._count.domainAssignments) * 100)
          : 0,
      };
    });
  }

  async getProject(id: string, institutionId: string) {
    // Compound filter: `findFirst({ where: { id, institutionId } })`
    // returns null for both "does not exist" and "exists in another
    // tenant". Callers surface that as a 404 via `NotFoundError`, so
    // no existence-oracle leaks the presence of another tenant's row.
    const project = await prisma.evaluationProject.findFirst({
      where: { id, institutionId },
      include: {
        systems: {
          include: {
            system: {
              select: { id: true, name: true, vendor: true, category: true, logoUrl: true, website: true },
            },
          },
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        domainAssignments: {
          include: {
            domain: { select: { id: true, code: true, name: true, category: true } },
            assignedTo: { select: { id: true, name: true, email: true } },
            scores: true,
          },
        },
      },
    });
    if (!project) throw new NotFoundError('Evaluation project not found');
    return project;
  }

  async updateProject(
    id: string,
    institutionId: string,
    data: UpdateEvaluationProjectInput,
    actor?: { userId?: string; name?: string },
  ) {
    // Snapshot prior state, mutate scoped by (id, institutionId), audit.
    // All inside one tx so the log can never drift out of sync with the
    // committed state. The post-commit re-read uses the non-tx prisma
    // so it sees the just-committed row (interactive-tx callbacks
    // commit on successful return).
    await prisma.$transaction(async (tx) => {
      const prior = await tx.evaluationProject.findFirst({
        where: { id, institutionId },
        select: { name: true, description: true, status: true, deadline: true, basketId: true },
      });
      if (!prior) throw new NotFoundError('Evaluation project not found');

      // Compute the deadline mutation ONCE so the update branch and
      // the audit branch can never disagree. Three intent classes
      // map cleanly to three outcomes:
      //   undefined / ''         → no-op (skip both update and audit)
      //   explicit `null`        → clear the column
      //   non-empty ISO string   → set to that Date
      // Empty-string special-cases the historic "deadline ? ... : null"
      // ambiguity: previously the update branch silently treated `''`
      // as a no-op (string was falsy) while the audit branch entered
      // and recorded `toDeadline: null`, falsely claiming a clear
      // that the DB never saw. Keep them aligned by deriving both
      // from the same intermediate.
      const nextDeadline: Date | null | undefined =
        data.deadline === undefined || data.deadline === ''
          ? undefined
          : data.deadline === null
            ? null
            : new Date(data.deadline);

      // `updateMany` keeps the tenant guard atomic. The row was just
      // verified to exist, so count: 0 here would only mean it was
      // deleted between read and write — surface as 404 too.
      const result = await tx.evaluationProject.updateMany({
        where: { id, institutionId },
        data: {
          ...data,
          deadline: nextDeadline,
        },
      });
      if (result.count === 0) {
        throw new NotFoundError('Evaluation project not found');
      }

      await tx.auditLog.create({
        data: {
          userId: actor?.userId ?? null,
          action: 'evaluation.project.update',
          entityType: 'EvaluationProject',
          entityId: id,
          changes: {
            // Only record fields the client actually sent — avoids a
            // noisy log full of `null → null` for absent fields. All
            // updatable columns on UpdateEvaluationProjectInput must
            // appear here; otherwise a governance review can't
            // reconstruct what changed.
            ...(data.name !== undefined && { fromName: prior.name, toName: data.name }),
            ...(data.description !== undefined && {
              fromDescription: prior.description,
              toDescription: data.description,
            }),
            ...(data.status !== undefined && { fromStatus: prior.status, toStatus: data.status }),
            ...(nextDeadline !== undefined && {
              // Normalise both sides to ISO-8601 strings (or null) so a
              // governance reviewer comparing before/after sees the
              // same shape on both sides. Both branches feed off the
              // same `nextDeadline` resolved above, so an empty-string
              // "no-op" intent neither updates the row NOR fires an
              // audit row claiming the deadline was cleared.
              fromDeadline: prior.deadline ? prior.deadline.toISOString() : null,
              toDeadline: nextDeadline === null ? null : nextDeadline.toISOString(),
            }),
            ...(data.basketId !== undefined && {
              fromBasketId: prior.basketId,
              toBasketId: data.basketId,
            }),
            actorName: actor?.name ?? null,
          },
        },
      });
    });

    return this.getProject(id, institutionId);
  }

  async addMember(projectId: string, userId: string, role: string) {
    // Race-safe: the previous `findUnique + create` could double-submit
    // past the check into a Prisma P2002 (unique constraint violation)
    // that leaked out as a 500. Rely on the unique constraint itself
    // as the serialisation point — the first `create` wins, the second
    // throws P2002 which we translate to our normal `ConflictError`.
    try {
      return await prisma.evaluationMember.create({
        data: { projectId, userId, role },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('User is already a member of this project');
      }
      throw err;
    }
  }

  async removeMember(projectId: string, memberId: string) {
    await prisma.evaluationMember.delete({ where: { id: memberId } });
    return { removed: true };
  }

  async addSystem(projectId: string, systemId: string) {
    // Same race-safe shape as addMember — let the unique constraint
    // serialise concurrent adds instead of the stale findUnique check.
    try {
      return await prisma.evaluationSystem.create({
        data: { projectId, systemId },
        include: { system: { select: { id: true, name: true, vendor: true } } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('System is already in this evaluation');
      }
      throw err;
    }
  }

  async removeSystem(projectId: string, systemId: string) {
    await prisma.evaluationSystem.delete({
      where: { projectId_systemId: { projectId, systemId } },
    });
    return { removed: true };
  }

  async assignDomains(projectId: string, data: AssignDomainsInput) {
    const results = await prisma.$transaction(
      data.assignments.map(a =>
        prisma.evaluationDomainAssignment.upsert({
          where: { projectId_domainId: { projectId, domainId: a.domainId } },
          create: { projectId, domainId: a.domainId, assignedToId: a.userId, status: 'pending' },
          update: { assignedToId: a.userId, status: 'pending', completedAt: null },
        })
      )
    );
    return results;
  }

  async getDomainProgress(projectId: string) {
    const assignments = await prisma.evaluationDomainAssignment.findMany({
      where: { projectId },
      include: {
        domain: { select: { id: true, code: true, name: true, category: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        scores: true,
      },
    });

    // Get total systems in project
    const systemCount = await prisma.evaluationSystem.count({ where: { projectId } });

    // Get total capabilities per domain
    const domainIds = [...new Set(assignments.map(a => a.domainId))];
    const capCounts = await prisma.capability.groupBy({
      by: ['domainId'],
      where: { domainId: { in: domainIds } },
      _count: { id: true },
    });
    const capCountMap = new Map(capCounts.map(c => [c.domainId, c._count.id]));

    return assignments.map(a => {
      const totalCaps = capCountMap.get(a.domainId) ?? 0;
      const expectedScores = totalCaps * systemCount;
      const actualScores = a.scores.length;
      const progress = expectedScores > 0 ? Math.round((actualScores / expectedScores) * 100) : 0;

      return {
        id: a.id,
        domain: a.domain,
        assignedTo: a.assignedTo,
        status: a.status,
        completedAt: a.completedAt,
        scoreCount: actualScores,
        expectedScores,
        progress,
      };
    });
  }

  async submitDomainScores(
    assignmentId: string,
    data: SubmitDomainScoresInput,
    actor?: { userId?: string; name?: string },
  ) {
    // Single callback transaction so the score upserts, completion
    // status flip, and audit log all share one snapshot. Without the
    // tx, a concurrent submit between the count and the status flip
    // could leave the assignment "complete" while scores are still
    // being added (or vice versa), and the audit log would point at
    // a stale completion state.
    return prisma.$transaction(async (tx) => {
      const assignment = await tx.evaluationDomainAssignment.findUnique({
        where: { id: assignmentId },
        include: {
          domain: { include: { capabilities: { select: { id: true } } } },
          project: { include: { systems: { select: { systemId: true } } } },
        },
      });
      if (!assignment) throw new NotFoundError('Domain assignment not found');

      for (const s of data.scores) {
        await tx.evaluationDomainScore.upsert({
          where: {
            assignmentId_systemId_capabilityId: {
              assignmentId,
              systemId: s.systemId,
              capabilityId: s.capabilityId,
            },
          },
          create: {
            assignmentId,
            systemId: s.systemId,
            capabilityId: s.capabilityId,
            value: s.value,
            notes: s.notes,
          },
          update: { value: s.value, notes: s.notes, scoredAt: new Date() },
        });
      }

      const totalCaps = assignment.domain.capabilities.length;
      const totalSystems = assignment.project.systems.length;
      const expectedTotal = totalCaps * totalSystems;
      const actualTotal = await tx.evaluationDomainScore.count({ where: { assignmentId } });

      // `complete` reflects the post-submission state — used by the
      // controller's response shape. `justCompleted` is the strict
      // edge: it is true only when THIS submission flipped the
      // assignment from non-completed to completed. Re-submissions
      // against an already-completed assignment must not (a) overwrite
      // the original `completedAt` timestamp or (b) emit a misleading
      // "this submission completed it" audit log.
      const complete = actualTotal >= expectedTotal && expectedTotal > 0;
      const justCompleted = complete && assignment.status !== 'completed';
      if (justCompleted) {
        await tx.evaluationDomainAssignment.update({
          where: { id: assignmentId },
          data: { status: 'completed', completedAt: new Date() },
        });
      }

      // `changes` captures the count-of-rows-affected and whether
      // this submission flipped the assignment to complete — the
      // governance review surface needs both. Per-cell score values
      // live in the EvaluationDomainScore rows themselves; logging
      // them here would duplicate the score table without value.
      await tx.auditLog.create({
        data: {
          userId: actor?.userId ?? null,
          action: 'evaluation.domain.scores.submit',
          entityType: 'EvaluationDomainAssignment',
          entityId: assignmentId,
          changes: {
            domainId: assignment.domainId,
            projectId: assignment.projectId,
            priorStatus: assignment.status,
            scoresSubmitted: data.scores.length,
            scoresTotal: actualTotal,
            scoresExpected: expectedTotal,
            justCompleted,
            actorName: actor?.name ?? null,
          },
        },
      });

      return { submitted: data.scores.length, complete };
    });
  }

  async getAggregatedScores(projectId: string) {
    const project = await prisma.evaluationProject.findUnique({
      where: { id: projectId },
      include: {
        systems: { include: { system: { select: { id: true, name: true, vendor: true, logoUrl: true } } } },
        domainAssignments: {
          include: {
            scores: true,
            domain: { include: { capabilities: { select: { id: true, name: true, sortOrder: true } } } },
          },
        },
      },
    });
    if (!project) throw new NotFoundError('Evaluation project not found');

    // For each system, aggregate scores across all assignments
    const systemResults = project.systems.map(es => {
      const allScores = project.domainAssignments.flatMap(da =>
        da.scores.filter(s => s.systemId === es.systemId)
      );

      const totalScore = allScores.reduce((sum, s) => sum + s.value, 0);
      const maxPossible = project.domainAssignments.reduce((sum, da) => sum + da.domain.capabilities.length * 100, 0);
      const percentage = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;

      // Calculate variance/stddev for consensus flag
      const values = allScores.map(s => s.value);
      const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      const variance = values.length > 1
        ? values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1)
        : 0;
      const stddev = Math.sqrt(variance);
      const highVariance = stddev > 30; // flag if stddev > 30 points

      // Scores by domain
      const byDomain = project.domainAssignments.map(da => {
        const domainScores = da.scores.filter(s => s.systemId === es.systemId);
        const domainTotal = domainScores.reduce((sum, s) => sum + s.value, 0);
        const domainMax = da.domain.capabilities.length * 100;
        return {
          domainId: da.domainId,
          domainCode: da.domain.code,
          score: domainTotal,
          maxScore: domainMax,
          percentage: domainMax > 0 ? Math.round((domainTotal / domainMax) * 100) : 0,
        };
      });

      return {
        system: es.system,
        totalScore,
        maxPossible,
        percentage,
        stddev: Math.round(stddev),
        highVariance,
        scoreCount: allScores.length,
        byDomain,
      };
    });

    // Rank by percentage descending
    systemResults.sort((a, b) => b.percentage - a.percentage);
    return systemResults.map((s, i) => ({ ...s, rank: i + 1 }));
  }

  async getTeamProgress(projectId: string) {
    const members = await prisma.evaluationMember.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const assignments = await prisma.evaluationDomainAssignment.findMany({
      where: { projectId },
      include: {
        scores: true,
        domain: { include: { capabilities: { select: { id: true } } } },
        project: { include: { systems: { select: { systemId: true } } } },
      },
    });

    const systemCount = await prisma.evaluationSystem.count({ where: { projectId } });

    return members.map(m => {
      const myAssignments = assignments.filter(a => a.assignedToId === m.userId);
      const completedAssignments = myAssignments.filter(a => a.status === 'completed');

      const myScores = myAssignments.flatMap(a => a.scores);
      const avgScore = myScores.length > 0
        ? Math.round(myScores.reduce((sum, s) => sum + s.value, 0) / myScores.length)
        : 0;

      const totalExpected = myAssignments.reduce((sum, a) => {
        return sum + a.domain.capabilities.length * systemCount;
      }, 0);
      const totalActual = myScores.length;
      const completionPct = totalExpected > 0 ? Math.round((totalActual / totalExpected) * 100) : 0;

      return {
        member: { ...m.user, role: m.role },
        domainsAssigned: myAssignments.length,
        domainsCompleted: completedAssignments.length,
        scoresSubmitted: totalActual,
        scoresExpected: totalExpected,
        averageScore: avgScore,
        completionPercentage: completionPct,
      };
    });
  }
}
