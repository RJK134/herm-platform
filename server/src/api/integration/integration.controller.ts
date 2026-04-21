import type { Request, Response, NextFunction } from 'express';
import { IntegrationService } from './integration.service';
import { createAssessmentSchema } from './integration.schema';

const service = new IntegrationService();

export const createAssessment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = createAssessmentSchema.parse(req.body);
    const assessment = await service.createAssessment(data);
    res.status(201).json({ success: true, data: assessment });
  } catch (err) {
    next(err);
  }
};

export const listAssessments = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await service.listAssessments();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getAssessment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await service.getAssessment(req.params['id'] as string);
    if (!data) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Assessment not found' },
      });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
