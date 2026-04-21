import type { Request, Response, NextFunction } from 'express';
import { VendorsService } from './vendors.service';
import { updateVendorProfileSchema } from './vendors.schema';
import { ok } from '../../lib/respond';

const service = new VendorsService();

export const getProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = await service.getProfile(req.params['id'] as string);
    ok(res, data);
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const input = updateVendorProfileSchema.parse(req.body);
    const data = await service.updateProfile(req.params['id'] as string, input);
    ok(res, data);
  } catch (err) {
    next(err);
  }
};

export const getVersions = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = await service.getVersions(req.params['id'] as string);
    ok(res, data);
  } catch (err) {
    next(err);
  }
};
