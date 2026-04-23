import type { Request, Response, NextFunction } from 'express';
import { CapabilitiesService } from './capabilities.service';
import { buildProvenance } from '../../lib/provenance';

const service = new CapabilitiesService();

/**
 * Responses from framework-scoped endpoints carry:
 *   - `data` — the payload itself,
 *   - `licence` — legacy top-level field (kept for existing clients),
 *   - `meta.provenance` — the canonical publisher + licence block that
 *     new consumers (including the HERM attribution banner, exports, and
 *     third-party API users) should read.
 */
export const listCapabilities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { capabilities, licence } = await service.listCapabilities(req.frameworkId);
    const provenance = buildProvenance(req);
    res.json({
      success: true,
      data: capabilities,
      licence,
      ...(provenance ? { meta: { provenance } } : {}),
    });
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
    const provenance = buildProvenance(req);
    res.json({
      success: true,
      data: capability,
      licence,
      ...(provenance ? { meta: { provenance } } : {}),
    });
  } catch (err) {
    next(err);
  }
};

export const listDomains = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { domains, licence } = await service.listDomains(req.frameworkId);
    const provenance = buildProvenance(req);
    res.json({
      success: true,
      data: domains,
      licence,
      ...(provenance ? { meta: { provenance } } : {}),
    });
  } catch (err) {
    next(err);
  }
};
