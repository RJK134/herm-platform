import type { Request, Response, NextFunction } from 'express';
import { ValueService } from './value.service';
import { valueAnalysisInputSchema } from './value.schema';

const service = new ValueService();

export const calculateValue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = valueAnalysisInputSchema.parse(req.body);
    const result = await service.calculate(data);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const saveAnalysis = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = valueAnalysisInputSchema.parse(req.body);
    if (req.user) data.institutionId = req.user.institutionId;
    const result = await service.saveAnalysis(data);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const listAnalyses = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.listAnalyses();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const getAnalysis = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getAnalysis(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const getBenchmarks = (_req: Request, res: Response): void => {
  const data = new ValueService().getBenchmarks();
  res.json({ success: true, data });
};
