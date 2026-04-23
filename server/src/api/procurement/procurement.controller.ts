import type { Request, Response, NextFunction } from 'express';
import { ProcurementService } from './procurement.service';
import {
  createProjectSchema,
  updateProjectSchema,
  updateStageSchema,
  addShortlistEntrySchema,
  updateShortlistEntrySchema,
  transitionProjectSchema,
  decideShortlistSchema,
} from './procurement.schema';
import { InvalidTransitionError } from '../../services/domain/procurement/project-status';

const service = new ProcurementService();

export const createProject = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = createProjectSchema.parse(req.body);
    const project = await service.createProject(data);
    res.status(201).json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
};

export const listProjects = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await service.listProjects();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getProject = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Governance-bearing columns (`decidedBy`, `rationale`) are only
    // surfaced to authenticated callers — anonymous readers of the
    // public project endpoint see them as `null`. See PROCUREMENT_WORKFLOW.md.
    const data = await service.getProject(req.params['id'] as string, {
      includeGovernance: !!req.user,
    });
    if (!data) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const updateProject = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = updateProjectSchema.parse(req.body);
    const project = await service.updateProject(req.params['id'] as string, data);
    res.json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
};

export const deleteProject = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await service.deleteProject(req.params['id'] as string);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
};

export const getWorkflow = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await service.getWorkflow(req.params['id'] as string);
    if (!data) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Workflow not found' },
      });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const updateStage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const stageNum = parseInt(req.params['stageNum'] as string, 10);
    const data = updateStageSchema.parse(req.body);
    const stage = await service.updateStage(req.params['id'] as string, stageNum, data);
    res.json({ success: true, data: stage });
  } catch (err) {
    next(err);
  }
};

export const advanceWorkflow = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await service.advanceWorkflow(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const addShortlistEntry = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = addShortlistEntrySchema.parse(req.body);
    const entry = await service.addShortlistEntry(req.params['id'] as string, data);
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
};

export const getShortlist = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await service.getShortlist(req.params['id'] as string, {
      includeGovernance: !!req.user,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const updateShortlistEntry = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = updateShortlistEntrySchema.parse(req.body);
    const entry = await service.updateShortlistEntry(
      req.params['entryId'] as string,
      data
    );
    res.json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
};

export const removeShortlistEntry = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await service.removeShortlistEntry(req.params['entryId'] as string);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
};

// ── Phase 3: status transitions + shortlist governance ────────────────────

function actorFromReq(req: Request): { userId?: string; name?: string } {
  return {
    userId: req.user?.userId,
    name: req.user?.name,
  };
}

export const transitionProjectStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = transitionProjectSchema.parse(req.body);
    const result = await service.transitionStatus(
      req.params['id'] as string,
      data,
      actorFromReq(req),
    );
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      res.status(409).json({
        success: false,
        error: {
          code: 'INVALID_TRANSITION',
          message: err.message,
          details: { from: err.from, to: err.to },
          requestId: req.id,
        },
      });
      return;
    }
    next(err);
  }
};

export const getProjectStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // `actorId` / `actorName` are scrubbed for unauthenticated callers —
    // public dashboards can still render the workflow history without
    // leaking reviewer CUIDs or display names.
    const data = await service.getStatusContext(req.params['id'] as string, {
      includeActor: !!req.user,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const decideShortlistEntry = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = decideShortlistSchema.parse(req.body);
    const entry = await service.decideShortlistEntry(
      req.params['id'] as string,
      req.params['entryId'] as string,
      data,
      actorFromReq(req),
    );
    res.json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
};

export const clearShortlistDecision = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const entry = await service.clearShortlistDecision(
      req.params['id'] as string,
      req.params['entryId'] as string,
      actorFromReq(req),
    );
    res.json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
};
