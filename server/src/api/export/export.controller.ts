import type { Request, Response, NextFunction } from 'express';
import { ExportService } from './export.service';
import { buildProvenance } from '../../lib/provenance';
import { audit } from '../../lib/audit';

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

// Exports are recorded as audit rows so a governance review can
// reconstruct who downloaded what data and when. The audit row captures
// the format, the framework scope, a row count when available, and the
// caller's IP via the audit() helper — the raw export body itself is
// not stored.
//
// DELIBERATE EXCEPTION to the project rule "persisted-data routes must
// use authenticateJWT, not optionalJWT": these routes ARE persisted-data
// routes (they write an AuditLog row), but they MUST stay reachable
// anonymously because `/api/export/*` is HERM (CC-BY-NC-SA-4.0) content
// and HERM access is free per HERM_COMPLIANCE.md "Public (no auth, free
// tier)". For anonymous callers we record `userId: null` and tag the row
// with `anonymous: true` so audit consumers can filter cleanly. The
// ipAddress column on AuditLog (populated by the audit helper) is the
// fallback identity for GDPR / abuse review.

function rowsFromCsv(csv: string): number {
  const idx = csv.indexOf('\n');
  if (idx < 0) return 0;
  // Subtract 1 for the header row; floor at 0 in case of empty body.
  const lines = csv.slice(idx + 1).split('\n').filter((l) => l.length > 0);
  return lines.length;
}

export const leaderboardCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const frameworkId = extractFrameworkId(req);
    const csv = await service.leaderboardCsv(frameworkId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="capability-leaderboard.csv"');
    setProvenanceHeaders(req, res);
    await audit(req, {
      action: 'export.csv',
      entityType: 'Export',
      userId: req.user?.userId ?? null,
      changes: {
        surface: 'leaderboard',
        frameworkId: frameworkId ?? null,
        rows: rowsFromCsv(csv),
        anonymous: !req.user,
      },
    });
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

export const heatmapCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const frameworkId = extractFrameworkId(req);
    const csv = await service.heatmapCsv(frameworkId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="capability-heatmap.csv"');
    setProvenanceHeaders(req, res);
    await audit(req, {
      action: 'export.csv',
      entityType: 'Export',
      userId: req.user?.userId ?? null,
      changes: {
        surface: 'heatmap',
        frameworkId: frameworkId ?? null,
        rows: rowsFromCsv(csv),
        anonymous: !req.user,
      },
    });
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

export const fullReportJson = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const frameworkId = extractFrameworkId(req);
    const report = await service.fullReportJson(frameworkId);
    const provenance = buildProvenance(req);
    const body = provenance ? { ...report, provenance } : report;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="capability-report.json"');
    setProvenanceHeaders(req, res);
    await audit(req, {
      action: 'export.json',
      entityType: 'Export',
      userId: req.user?.userId ?? null,
      changes: {
        surface: 'fullReport',
        frameworkId: frameworkId ?? null,
        anonymous: !req.user,
      },
    });
    res.json(body);
  } catch (err) {
    next(err);
  }
};
