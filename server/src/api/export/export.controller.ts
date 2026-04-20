import { Request, Response, NextFunction } from 'express';
import { ExportService } from './export.service';

const service = new ExportService();

function extractFrameworkId(req: Request): string | undefined {
  const raw = req.query['frameworkId'];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return undefined;
}

export const leaderboardCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const csv = await service.leaderboardCsv(extractFrameworkId(req));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="capability-leaderboard.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

export const heatmapCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const csv = await service.heatmapCsv(extractFrameworkId(req));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="capability-heatmap.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

export const fullReportJson = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const report = await service.fullReportJson(extractFrameworkId(req));
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="capability-report.json"');
    res.json(report);
  } catch (err) {
    next(err);
  }
};
