import { Request, Response, NextFunction } from 'express';
import { VendorsService } from './vendors.service';

const service = new VendorsService();

export const getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getProfile(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.updateProfile(req.params['id'] as string, req.body as Record<string, unknown>);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getVersions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getVersions(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
