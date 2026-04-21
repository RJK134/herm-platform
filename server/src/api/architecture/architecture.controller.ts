import type { Request, Response, NextFunction } from 'express';
import { ArchitectureService } from './architecture.service';
import { createArchitectureAssessmentSchema } from './architecture.schema';

const service = new ArchitectureService();

export const createAssessment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createArchitectureAssessmentSchema.parse(req.body);
    if (req.user) data.institutionId = req.user.institutionId;
    const result = await service.createAssessment(data);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const listAssessments = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.listAssessments();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const getAssessment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getAssessment(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const deleteAssessment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await service.deleteAssessment(req.params['id'] as string);
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
};

export const analysePreview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createArchitectureAssessmentSchema.parse(req.body);
    const result = service.analyse(data);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};
