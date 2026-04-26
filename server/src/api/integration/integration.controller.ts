import type { Request, Response, NextFunction } from 'express';
import { IntegrationService } from './integration.service';
import { createAssessmentSchema } from './integration.schema';

const service = new IntegrationService();

// Integration assessments persist rows in the DB and are now tenant-scoped:
// `institutionId` is stamped from the JWT on create (never the body) and
// every read filters by the caller's institutionId. The router-level
// authenticateJWT guarantees req.user is present.

export const createAssessment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = createAssessmentSchema.parse(req.body);
    const { institutionId, userId } = req.user!;
    const assessment = await service.createAssessment(data, institutionId, userId);
    res.status(201).json({ success: true, data: assessment });
  } catch (err) {
    next(err);
  }
};

export const listAssessments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await service.listAssessments(req.user!.institutionId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getAssessment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await service.getAssessment(req.params['id'] as string, req.user!.institutionId);
    if (!data) {
      // Not found OR exists-but-other-tenant — same response either way.
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Assessment not found' },
      });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
