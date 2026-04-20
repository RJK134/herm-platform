import type { Request, Response, NextFunction } from 'express';
import { ExportService } from './export.service';

const service = new ExportService();

export const leaderboardCsv = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const csv = await service.leaderboardCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="herm-leaderboard.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

export const heatmapCsv = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const csv = await service.heatmapCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="herm-heatmap.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

export const fullReportJson = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const report = await service.fullReportJson();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="herm-report.json"');
    res.json(report);
  } catch (err) {
    next(err);
  }
};
