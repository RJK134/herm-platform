import { Request, Response, NextFunction } from 'express';
import { EvaluationsService } from './evaluations.service';
import {
  createEvaluationProjectSchema,
  updateEvaluationProjectSchema,
  addMemberSchema,
  assignDomainsSchema,
  submitDomainScoresSchema,
  addSystemSchema,
} from './evaluations.schema';
import { NotFoundError } from '../../utils/errors';

const svc = new EvaluationsService();

const DEFAULT_INSTITUTION = 'anonymous';

export const createProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createEvaluationProjectSchema.parse(req.body);
    const institutionId = req.user?.institutionId ?? DEFAULT_INSTITUTION;
    const leadUserId = req.user?.userId ?? DEFAULT_INSTITUTION;
    const project = await svc.createProject(data, institutionId, leadUserId);
    res.status(201).json({ success: true, data: project });
  } catch (err) { next(err); }
};

export const listProjects = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const institutionId = (req.query['institutionId'] as string) ?? req.user?.institutionId ?? DEFAULT_INSTITUTION;
    const data = await svc.listProjects(institutionId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const getProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await svc.getProject(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const updateProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = updateEvaluationProjectSchema.parse(req.body);
    const result = await svc.updateProject(req.params['id'] as string, data);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const addMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = addMemberSchema.parse(req.body);
    const projectId = req.params['id'] as string;

    let userId = body.userId;
    if (!userId && body.email) {
      const user = await import('../../utils/prisma').then(m =>
        m.default.user.findUnique({ where: { email: body.email }, select: { id: true } })
      );
      if (!user) throw new NotFoundError(`No user found with email: ${body.email}`);
      userId = user.id;
    }
    if (!userId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'userId or email required' } });
      return;
    }
    const result = await svc.addMember(projectId, userId, body.role);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const removeMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await svc.removeMember(req.params['id'] as string, req.params['memberId'] as string);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const addSystem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = addSystemSchema.parse(req.body);
    const result = await svc.addSystem(req.params['id'] as string, body.systemId);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const removeSystem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await svc.removeSystem(req.params['id'] as string, req.params['sysId'] as string);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const assignDomains = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = assignDomainsSchema.parse(req.body);
    const result = await svc.assignDomains(req.params['id'] as string, data);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const getDomainProgress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await svc.getDomainProgress(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const submitDomainScores = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = submitDomainScoresSchema.parse(req.body);
    const result = await svc.submitDomainScores(req.params['domainId'] as string, data);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const getAggregatedScores = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await svc.getAggregatedScores(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const getTeamProgress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await svc.getTeamProgress(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};
