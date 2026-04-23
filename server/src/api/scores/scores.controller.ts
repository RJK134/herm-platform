import type { Request, Response, NextFunction } from 'express';
import { ScoresService } from './scores.service';
import { buildProvenance } from '../../lib/provenance';

const service = new ScoresService();

// Source of truth for the active framework is req.frameworkId, populated by
// the frameworkContext middleware mounted on /api/scores in app.ts. Using
// the middleware-resolved value guarantees consistent resolution across
// every framework-scoped route (systems, capabilities, vendor-portal, scores)
// and honours the middleware's tier-safe fallback to the first public
// framework when no ?frameworkId query parameter is supplied.

export const getLeaderboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { entries, licence, framework } = await service.getLeaderboard(req.frameworkId);
    const provenance = buildProvenance(req);
    res.json({
      success: true,
      data: entries,
      licence,
      framework,
      ...(provenance ? { meta: { provenance } } : {}),
    });
  } catch (err) {
    next(err);
  }
};

export const getHeatmap = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getHeatmap(req.frameworkId);
    const provenance = buildProvenance(req);
    res.json({
      success: true,
      data,
      ...(provenance ? { meta: { provenance } } : {}),
    });
  } catch (err) {
    next(err);
  }
};
