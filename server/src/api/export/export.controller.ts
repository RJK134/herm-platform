import type { Request, Response, NextFunction } from 'express';
import { ExportService } from './export.service';
import { buildProvenance } from '../../lib/provenance';

const service = new ExportService();

function extractFrameworkId(req: Request): string | undefined {
  const raw = req.query['frameworkId'];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return undefined;
}

/**
 * Export responses expose framework provenance via `x-framework-*` headers
 * so downstream consumers preserve HERM attribution even when the body is
 * CSV we don't want to pollute with comment rows (many consumers choke on
 * leading `#` lines). JSON exports additionally inline the provenance
 * block at the document root.
 */
function setProvenanceHeaders(req: Request, res: Response): void {
  const provenance = buildProvenance(req);
  if (!provenance) return;
  const { framework } = provenance;
  res.setHeader('x-framework-id', framework.id);
  res.setHeader('x-framework-slug', framework.slug);
  res.setHeader('x-framework-publisher', framework.publisher);
  res.setHeader('x-framework-licence', framework.licence.type);
  if (framework.licence.url) res.setHeader('x-framework-licence-url', framework.licence.url);
}

export const leaderboardCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const csv = await service.leaderboardCsv(extractFrameworkId(req));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="capability-leaderboard.csv"');
    setProvenanceHeaders(req, res);
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
    setProvenanceHeaders(req, res);
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

export const fullReportJson = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const report = await service.fullReportJson(extractFrameworkId(req));
    const provenance = buildProvenance(req);
    const body = provenance ? { ...report, provenance } : report;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="capability-report.json"');
    setProvenanceHeaders(req, res);
    res.json(body);
  } catch (err) {
    next(err);
  }
};
