import { Request, Response, NextFunction } from 'express';
import { ScoringService } from './scoring.service';

const service = new ScoringService();

export const getMethodology = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getMethodology();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getFaq = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getFaq();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getEvidenceTypes = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getEvidenceTypes();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
