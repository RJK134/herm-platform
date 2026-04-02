import { Request, Response, NextFunction } from 'express';
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
    const estimate = await service.saveEstimate(data);
    res.status(201).json({ success: true, data: estimate });
  } catch (err) {
    next(err);
  }
};

export const listEstimates = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await service.listEstimates();
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
    const data = await service.getEstimate(req.params['id'] as string);
    if (!data) {
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
