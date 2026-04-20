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
} from './procurement.schema';

// POST /api/procurement/v2/projects — create with stage generation
export const createProjectV2 = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createProjectV2Schema.parse(req.body);
    const institutionId = req.user?.institutionId ?? data.institutionId ?? 'anonymous';

    // Ensure institution exists
    let institution = await prisma.institution.findUnique({ where: { id: institutionId } });
    if (!institution) {
      institution = await prisma.institution.upsert({
        where: { slug: 'default' },
        update: {},
        create: { id: institutionId, name: 'Default Institution', slug: 'default', country: 'UK' },
      });
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
    const result = await procurementEngine.advanceStage(req.params['id'] as string);
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
    const task = await prisma.stageTask.update({
      where: { id: req.params['taskId'] as string },
      data: {
        ...data,
        completedAt: data.isCompleted ? new Date() : null,
        completedBy: data.isCompleted ? (data.completedBy ?? req.user?.name ?? 'user') : null,
      },
    });
    res.json({ success: true, data: task });
  } catch (err) { next(err); }
};

// PATCH /api/procurement/v2/projects/:id/stages/:stageId/approvals/:approvalId
export const updateApproval = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = updateApprovalSchema.parse(req.body);
    const approval = await prisma.stageApproval.update({
      where: { id: req.params['approvalId'] as string },
      data: { ...data, decidedAt: new Date() },
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
    const evaluation = await prisma.procurementEvaluation.upsert({
      where: { projectId_systemId_evaluatorId: { projectId: req.params['id'] as string, systemId: data.systemId, evaluatorId: req.user?.userId ?? 'anonymous' } },
      update: { weightingProfile: (data.weightingProfile ?? { herm: 40, technical: 25, commercial: 20, implementation: 10, reference: 5 }) as unknown as import('@prisma/client').Prisma.InputJsonValue },
      create: {
        projectId: req.params['id'] as string,
        systemId: data.systemId,
        evaluatorId: req.user?.userId ?? 'anonymous',
        evaluatorName: data.evaluatorName ?? req.user?.name ?? 'Evaluator',
        weightingProfile: (data.weightingProfile ?? { herm: 40, technical: 25, commercial: 20, implementation: 10, reference: 5 }) as unknown as import('@prisma/client').Prisma.InputJsonValue,
      },
      include: { system: { select: { id: true, name: true, vendor: true } } },
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

// PATCH /api/procurement/v2/projects/:id/evaluations/:evalId
export const updateEvaluation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = updateEvaluationSchema.parse(req.body);
    const existing = await prisma.procurementEvaluation.findUnique({ where: { id: req.params['evalId'] as string } });
    if (!existing) throw new NotFoundError('Evaluation not found');

    // Auto-calculate overall score
    const wp = (data.weightingProfile ?? existing.weightingProfile ?? { herm: 40, technical: 25, commercial: 20, implementation: 10, reference: 5 }) as Record<string, number>;
    const hermScore = Number(data.hermScore ?? existing.hermScore ?? 0);
    const technicalScore = Number(data.technicalScore ?? existing.technicalScore ?? 0);
    const commercialScore = Number(data.commercialScore ?? existing.commercialScore ?? 0);
    const implementationScore = Number(data.implementationScore ?? existing.implementationScore ?? 0);
    const referenceScore = Number(data.referenceScore ?? existing.referenceScore ?? 0);

    const overallScore = (
      hermScore * (wp['herm'] ?? 40) +
      technicalScore * (wp['technical'] ?? 25) +
      commercialScore * (wp['commercial'] ?? 20) +
      implementationScore * (wp['implementation'] ?? 10) +
      referenceScore * (wp['reference'] ?? 5)
    ) / 100;

    const recommendation = overallScore >= 75 ? 'award' : overallScore >= 60 ? 'shortlist' : overallScore >= 45 ? 'reserve' : 'reject';

    const updated = await prisma.procurementEvaluation.update({
      where: { id: req.params['evalId'] as string },
      data: {
        hermScore: data.hermScore ?? undefined,
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
              include: { family: true },
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
