import type { Request, Response, NextFunction } from 'express';
import { coiService, hashCoiDeclaration } from './coi.service';
import { audit } from '../../lib/audit';
import { ValidationError } from '../../utils/errors';

// Phase 14.9 — Conflict-of-Interest declaration endpoints. Mounted by
// evaluations.router under /:id/coi. Submit is self-only (evaluator
// declares for themselves); reads support both self (/coi/me) and
// project-wide (/coi) for procurement leads to audit-review the
// captured declarations.

interface SubmitCoiBody {
  declaredText?: string;
}

export async function submitOwnCoi(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user?.userId) {
      throw new ValidationError('Authentication required to submit a CoI declaration');
    }
    const body = req.body as SubmitCoiBody;
    const declaredText = (body.declaredText ?? '').toString();
    // Empty string is permitted ("no conflicts to declare") — the row's
    // existence is the audit signal that the declaration step happened.
    // We DO require the caller to send the field so accidental submission
    // of a stale browser tab (no body) gets rejected.
    if (typeof body.declaredText !== 'string') {
      throw new ValidationError('declaredText is required (use empty string for "no conflicts")');
    }

    const evaluationProjectId = req.params['id'];
    if (!evaluationProjectId) {
      throw new ValidationError('Project id is required');
    }

    const row = await coiService.submit({
      evaluationProjectId,
      userId: req.user.userId,
      declaredText,
    });

    // Audit the action; deliberately store hash rather than text so the
    // audit log itself can't leak commercially-sensitive disclosure
    // content if exported. The hash matches `row.declaredHash` for
    // cross-correlation with the row.
    await audit(req, {
      action: 'auth.coi.declare',
      entityType: 'ConflictOfInterestDeclaration',
      entityId: row.id,
      userId: req.user.userId,
      changes: {
        evaluationProjectId,
        declaredHash: row.declaredHash,
        textLength: row.declaredText.length,
      },
    });

    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

export async function getOwnCoi(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.json({ success: true, data: null });
      return;
    }
    const evaluationProjectId = req.params['id'];
    if (!evaluationProjectId) {
      throw new ValidationError('Project id is required');
    }
    const row = await coiService.getMine(evaluationProjectId, req.user.userId);
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

export async function listProjectCoi(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const evaluationProjectId = req.params['id'];
    if (!evaluationProjectId) {
      throw new ValidationError('Project id is required');
    }
    const rows = await coiService.listForProject(evaluationProjectId);

    // Light tamper-check pass: surface the row's stored hash alongside a
    // freshly-recomputed hash so callers can spot any text mutation that
    // bypassed the API. (Won't catch DB-level mutation but catches
    // accidental client-side edits if the row was ever exposed for edit.)
    const enriched = rows.map((row) => ({
      ...row,
      hashMatches: row.declaredHash === hashCoiDeclaration(row.declaredText),
    }));
    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
}
