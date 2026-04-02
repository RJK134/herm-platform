import { Request, Response, NextFunction } from 'express';
import { SystemsService } from './systems.service';

const service = new SystemsService();

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { category } = req.query as { category?: string };
    const data = await service.listSystems({ category });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getSystemById(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getScores = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getSystemScores(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const compare = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ids } = req.query as { ids?: string };
    const idList = ids ? ids.split(',').filter(Boolean) : [];
    if (idList.length < 2) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'At least 2 system IDs required' } });
      return;
    }
    const data = await service.compareSystems(idList);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
