import type { Request, Response, NextFunction } from 'express';
import { CapabilitiesService } from './capabilities.service';

const service = new CapabilitiesService();

export const listCapabilities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Scope to the active framework resolved by framework-context middleware.
    const { capabilities, licence } = await service.listCapabilities(req.frameworkId);
    res.json({ success: true, data: capabilities, licence });
  } catch (err) {
    next(err);
  }
};

export const getByCode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { capability, licence } = await service.getCapabilityByCode(
      req.params['code'] as string,
      req.frameworkId,
    );
    res.json({ success: true, data: capability, licence });
  } catch (err) {
    next(err);
  }
};

export const listDomains = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { domains, licence } = await service.listDomains(req.frameworkId);
    res.json({ success: true, data: domains, licence });
  } catch (err) {
    next(err);
  }
};
