import { Request, Response, NextFunction } from 'express';
import { ScoresService } from './scores.service';

const service = new ScoresService();

function extractFrameworkId(req: Request): string | undefined {
  const raw = req.query['frameworkId'];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return undefined;
}

export const getLeaderboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const frameworkId = extractFrameworkId(req);
    const { entries, licence, framework } = await service.getLeaderboard(frameworkId);
    res.json({ success: true, data: entries, licence, framework });
  } catch (err) {
    next(err);
  }
};

export const getHeatmap = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const frameworkId = extractFrameworkId(req);
    const data = await service.getHeatmap(frameworkId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
