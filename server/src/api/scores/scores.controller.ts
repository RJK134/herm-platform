import type { Request, Response, NextFunction } from 'express';
import { ScoresService } from './scores.service';

const service = new ScoresService();

export const getLeaderboard = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getLeaderboard();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getHeatmap = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getHeatmap();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
