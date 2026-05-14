import type { Request, Response, NextFunction } from 'express';
import { procurementEngine } from '../../services/procurement-engine';
import { NotFoundError } from '../../utils/errors';
import prisma from '../../utils/prisma';
import {
  createProjectV2Schema,
  updateTaskSchema,
  updateApprovalSchema,
  updateEvaluationSchema,
  addEvaluationSchema,
  importBasketShortlistSchema,
} from './procurement.schema';
import { ProcurementService } from './procurement.service';
import { recordUsage } from '../../middleware/enforceQuota';

const procurementService = new ProcurementService();

// POST /api/procurement/v2/projects — create with stage generation
export const createProjectV2 = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createProjectV2Schema.parse(req.body);
    // `authenticateJWT` has already populated `req.user`; the body has no
    // `institutionId` field and anything sent is dropped by zod strip.
    // Cross-tenant writes via this route are structurally impossible.
    const institutionId = req.user!.institutionId;

    // Ensure institution exists (defensive: JWT could reference a row
    // that has since been deleted — extremely rare, but better to fail
    // fast than orphan the project).
    const institution = await prisma.institution.findUnique({ where: { id: institutionId } });
    if (!institution) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Caller institution no longer exists',
        },
      });
      return;
    }

    const project = await procurementEngine.createProjectWithStages({
      name: data.name,
      description: data.description,
      institutionId: institution.id,
      jurisdiction: data.jurisdiction,
      basketId: data.basketId,
      estimatedValue: data.estimatedValue,
      procurementRoute: data.procurementRoute,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
    });

    // Phase 15.3: post-write usage increment. enforceQuota
    // ('procurement.projects') gated the request; this updates the
    // monthly counter only after the project is durably persisted.
    await recordUsage(institution.id, 'procurement.projects');

    res.status(201).json({ success: true, data: project });
  } catch (err) { next(err); }
};

// GET /api/procurement/v2/projects — list with stage summary
export const listProjectsV2 = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projects = await prisma.procurementProject.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        stages: { orderBy: { stageOrder: 'asc' }, select: { stageCode: true, stageName: true, stageOrder: true, status: true } },
      },
    });
    res.json({ success: true, data: projects });
  } catch (err) { next(err); }
};

// GET /api/procurement/v2/projects/:id — full project detail
export const getProjectV2 = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const project = await prisma.procurementProject.findUnique({
      where: { id: req.params['id'] as string },
      include: {
        stages: {
          orderBy: { stageOrder: 'asc' },
          include: {
            tasks: { orderBy: { sortOrder: 'asc' } },
            approvals: true,
            documents: true,
          },
        },
        evaluations: {
          include: { system: { select: { id: true, name: true, vendor: true, category: true } } },
        },
        complianceChecks: true,
        shortlist: { include: { system: { select: { id: true, name: true, vendor: true } } } },
      },
    });
    if (!project) throw new NotFoundError('Project not found');
    res.json({ success: true, data: project });
  } catch (err) { next(err); }
};

// POST /api/procurement/v2/projects/:id/stages/:stageId/advance
export const advanceStage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Route is behind `authenticateJWT`, so `req.user` is guaranteed.
    // Pass actor through so the engine records a transactional audit
    // log alongside the stage state change.
    const result = await procurementEngine.advanceStage(req.params['id'] as string, {
      userId: req.user!.userId,
      name: req.user!.name,
    });
    if (!result.success) {
      res.status(422).json({ success: false, error: { code: 'COMPLIANCE_FAILURE', message: 'Stage cannot be advanced', details: result.failures } });
      return;
    }
    res.json({ success: true, data: { newStage: result.newStage } });
  } catch (err) { next(err); }
};

// PATCH /api/procurement/v2/projects/:id/stages/:stageId/tasks/:taskId
export const updateTask = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = updateTaskSchema.parse(req.body);
    const taskId = req.params['taskId'] as string;

    // Callback transaction: read prior state, write, log. A concurrent
    // writer can no longer leave the AuditLog pointing at a stale
    // "before" snapshot.
    const task = await prisma.$transaction(async (tx) => {
      const prior = await tx.stageTask.findUnique({
        where: { id: taskId },
        select: { isCompleted: true, completedBy: true, completedAt: true },
      });
      if (!prior) throw new NotFoundError('Task not found');

      const updated = await tx.stageTask.update({
        where: { id: taskId },
        data: {
          ...data,
          completedAt: data.isCompleted ? new Date() : null,
          // Completion attribution comes from the JWT when flagging
          // complete. An explicit `data.completedBy` is only honoured
          // when present; the old `?? 'user'` fallback is gone now
          // that the route is JWT-gated.
          completedBy: data.isCompleted ? (data.completedBy ?? req.user!.name) : null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: 'procurement.task.update',
          entityType: 'StageTask',
          entityId: taskId,
          changes: {
            fromCompleted: prior.isCompleted,
            toCompleted: updated.isCompleted,
            completedBy: updated.completedBy,
            actorName: req.user!.name,
          },
        },
      });

      return updated;
    });
    res.json({ success: true, data: task });
  } catch (err) { next(err); }
};

// PATCH /api/procurement/v2/projects/:id/stages/:stageId/approvals/:approvalId
export const updateApproval = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = updateApprovalSchema.parse(req.body);
    const approvalId = req.params['approvalId'] as string;

    const approval = await prisma.$transaction(async (tx) => {
      const prior = await tx.stageApproval.findUnique({
        where: { id: approvalId },
        select: { status: true, approverName: true, comments: true },
      });
      if (!prior) throw new NotFoundError('Approval not found');

      const updated = await tx.stageApproval.update({
        where: { id: approvalId },
        data: { ...data, decidedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: 'procurement.approval.decide',
          entityType: 'StageApproval',
          entityId: approvalId,
          changes: {
            fromStatus: prior.status,
            toStatus: updated.status,
            approverName: updated.approverName,
            comments: updated.comments,
            actorName: req.user!.name,
          },
        },
      });

      return updated;
    });
    res.json({ success: true, data: approval });
  } catch (err) { next(err); }
};

// GET /api/procurement/v2/projects/:id/compliance
export const getCompliance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await procurementEngine.runComplianceCheck(req.params['id'] as string);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// GET /api/procurement/v2/projects/:id/timeline
export const getTimeline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const project = await prisma.procurementProject.findUnique({ where: { id: req.params['id'] as string } });
    if (!project) throw new NotFoundError('Project not found');
    const stages = procurementEngine.getStageDefinitions(project.jurisdiction);
    const startDate = project.startDate ?? project.createdAt;
    const timeline = procurementEngine.generateTimeline(stages, startDate);
    res.json({ success: true, data: timeline });
  } catch (err) { next(err); }
};

// POST /api/procurement/v2/projects/:id/evaluations
export const addEvaluation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = addEvaluationSchema.parse(req.body);
    const projectId = req.params['id'] as string;
    const evaluatorId = req.user!.userId;
    const weightingProfile = (data.weightingProfile ?? {
      framework: 40, technical: 25, commercial: 20, implementation: 10, reference: 5,
    }) as unknown as import('@prisma/client').Prisma.InputJsonValue;

    const evaluation = await prisma.$transaction(async (tx) => {
      const prior = await tx.procurementEvaluation.findUnique({
        where: { projectId_systemId_evaluatorId: { projectId, systemId: data.systemId, evaluatorId } },
        select: { id: true, weightingProfile: true },
      });

      const upserted = await tx.procurementEvaluation.upsert({
        where: { projectId_systemId_evaluatorId: { projectId, systemId: data.systemId, evaluatorId } },
        update: { weightingProfile },
        create: {
          projectId,
          systemId: data.systemId,
          evaluatorId,
          // Evaluator attribution comes from the JWT (`authenticateJWT`
          // gate above). `data.evaluatorName` is accepted only as a
          // display override; the audit `userId` is always the JWT sub.
          evaluatorName: data.evaluatorName ?? req.user!.name,
          weightingProfile,
        },
        include: { system: { select: { id: true, name: true, vendor: true } } },
      });

      await tx.auditLog.create({
        data: {
          userId: evaluatorId,
          action: prior ? 'procurement.evaluation.reweight' : 'procurement.evaluation.add',
          entityType: 'ProcurementEvaluation',
          entityId: upserted.id,
          changes: {
            projectId,
            systemId: data.systemId,
            priorWeighting: prior?.weightingProfile ?? null,
            newWeighting: weightingProfile,
            actorName: req.user!.name,
          },
        },
      });

      return upserted;
    });
    res.status(201).json({ success: true, data: evaluation });
  } catch (err) { next(err); }
};

// GET /api/procurement/v2/projects/:id/evaluations
export const getEvaluations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const evaluations = await prisma.procurementEvaluation.findMany({
      where: { projectId: req.params['id'] as string },
      include: { system: { select: { id: true, name: true, vendor: true, category: true } } },
      orderBy: { overallScore: 'desc' },
    });
    res.json({ success: true, data: evaluations });
  } catch (err) { next(err); }
};

// GET /api/procurement/v2/projects/:id/shortlist
export const getShortlistV2 = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const entries = await procurementService.getShortlistSystems(req.params.id);
    res.json({ success: true, data: entries });
  } catch (err) { next(err); }
};

// POST /api/procurement/v2/projects/:id/shortlist/import-basket
export const importBasketShortlistV2 = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = importBasketShortlistSchema.parse(req.body);
    const result = await procurementService.importBasketToShortlist(
      req.params.id,
      data,
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// PATCH /api/procurement/v2/projects/:id/evaluations/:evalId
export const updateEvaluation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = updateEvaluationSchema.parse(req.body);
    const evalId = req.params['evalId'] as string;

    // Callback transaction: snapshot prior state, compute new scores,
    // write, audit. Without the tx, a concurrent PATCH between the
    // read and the write could silently overwrite scores with a
    // half-stale weighting profile.
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.procurementEvaluation.findUnique({ where: { id: evalId } });
      if (!existing) throw new NotFoundError('Evaluation not found');

      const wp = (data.weightingProfile ?? existing.weightingProfile ?? {
        framework: 40, technical: 25, commercial: 20, implementation: 10, reference: 5,
      }) as Record<string, number>;
      const frameworkScore = Number(data.frameworkScore ?? existing.frameworkScore ?? 0);
      const technicalScore = Number(data.technicalScore ?? existing.technicalScore ?? 0);
      const commercialScore = Number(data.commercialScore ?? existing.commercialScore ?? 0);
      const implementationScore = Number(data.implementationScore ?? existing.implementationScore ?? 0);
      const referenceScore = Number(data.referenceScore ?? existing.referenceScore ?? 0);

      const overallScore = (
        frameworkScore * (wp['framework'] ?? 40) +
        technicalScore * (wp['technical'] ?? 25) +
        commercialScore * (wp['commercial'] ?? 20) +
        implementationScore * (wp['implementation'] ?? 10) +
        referenceScore * (wp['reference'] ?? 5)
      ) / 100;

      const recommendation = overallScore >= 75 ? 'award' : overallScore >= 60 ? 'shortlist' : overallScore >= 45 ? 'reserve' : 'reject';

      const row = await tx.procurementEvaluation.update({
        where: { id: evalId },
        data: {
          frameworkScore: data.frameworkScore ?? undefined,
          technicalScore: data.technicalScore ?? undefined,
          commercialScore: data.commercialScore ?? undefined,
          implementationScore: data.implementationScore ?? undefined,
          referenceScore: data.referenceScore ?? undefined,
          overallScore: Math.round(overallScore * 10) / 10,
          recommendation: data.recommendation ?? recommendation,
          notes: data.notes ?? undefined,
          weightingProfile: data.weightingProfile ? (data.weightingProfile as unknown as import('@prisma/client').Prisma.InputJsonValue) : undefined,
          submittedAt: new Date(),
        },
        include: { system: { select: { id: true, name: true, vendor: true } } },
      });

      // Capture prior vs new scores so an audit review can reconstruct
      // the decision trail. `recommendation` changes are the most
      // commercially significant — e.g. a flip from 'reject' to
      // 'award' should be visible in the log even if notes are empty.
      await tx.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: 'procurement.evaluation.update',
          entityType: 'ProcurementEvaluation',
          entityId: evalId,
          changes: {
            fromRecommendation: existing.recommendation,
            toRecommendation: row.recommendation,
            fromOverallScore: existing.overallScore,
            toOverallScore: row.overallScore,
            actorName: req.user!.name,
          },
        },
      });

      return row;
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

// GET /api/procurement/jurisdictions
export const listJurisdictions = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await prisma.procurementJurisdiction.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// GET /api/procurement/jurisdictions/:code
export const getJurisdiction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await prisma.procurementJurisdiction.findUnique({ where: { code: req.params['code'] as string } });
    if (!data) throw new NotFoundError('Jurisdiction not found');
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// GET /api/procurement/v2/projects/:id/specification
export const getSpecification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const project = await prisma.procurementProject.findUnique({ where: { id: req.params['id'] as string } });
    if (!project) throw new NotFoundError('Project not found');
    if (!project.basketId) {
      res.json({ success: true, data: { sections: [], message: 'No capability basket linked to this project' } });
      return;
    }
    const basket = await prisma.capabilityBasket.findUnique({
      where: { id: project.basketId },
      include: {
        items: {
          include: {
            capability: {
              include: { domain: true },
            },
          },
        },
      },
    });
    if (!basket) { res.json({ success: true, data: { sections: [] } }); return; }
    const sections = procurementEngine.hermToSpecification(basket.items);
    res.json({ success: true, data: { basketName: basket.name, sections } });
  } catch (err) { next(err); }
};
