import type { Request, Response, NextFunction } from 'express';
import { TcoService } from './tco.service';
import {
  calculateTcoSchema,
  compareTcoSchema,
  saveEstimateSchema,
} from './tco.schema';

const service = new TcoService();

export const getBenchmarks = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const data = service.getBenchmarks();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getBenchmark = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const data = service.getBenchmark(req.params['slug'] as string);
    if (!data) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Benchmark not found for that slug' },
      });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const calculate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const { systemSlug, studentCount, horizonYears, overrides } =
      calculateTcoSchema.parse(req.body);
    const data = service.calculate(systemSlug, studentCount, horizonYears, overrides);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const compare = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { systemSlugs, studentCount, horizonYears } = compareTcoSchema.parse(req.body);
    const data = await service.compareMultiple(systemSlugs, studentCount, horizonYears);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const saveEstimate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = saveEstimateSchema.parse(req.body);
    // `authenticateJWT` runs before this controller so `req.user` is
    // guaranteed. Creator attribution is stamped server-side; a body
    // field would just be ignored. Institution defaults to the caller's
    // institution but a body override is still honoured for SUPER_ADMIN
    // flows that save on behalf of another tenant.
    const estimate = await service.saveEstimate({
      ...data,
      createdById: req.user!.userId,
      institutionId: data.institutionId ?? req.user!.institutionId,
    });
    res.status(201).json({ success: true, data: estimate });
  } catch (err) {
    next(err);
  }
};

export const listEstimates = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // `authenticateJWT` guards this route, so `req.user` is guaranteed.
    const data = await service.listEstimates(req.user!.institutionId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getEstimate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await service.getEstimate(
      req.params['id'] as string,
      req.user!.institutionId,
    );
    if (!data) {
      // Uniform "not found" for both truly-missing and cross-tenant
      // IDs so callers can't probe estimate existence across tenants.
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Estimate not found' },
      });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
