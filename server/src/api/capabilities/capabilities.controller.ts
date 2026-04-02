import { Request, Response, NextFunction } from 'express';
import { CapabilitiesService } from './capabilities.service';

const service = new CapabilitiesService();

export const listCapabilities = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.listCapabilities();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getByCode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getCapabilityByCode(req.params['code'] as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const listFamilies = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.listFamilies();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
