import { Request, Response, NextFunction } from 'express';
import { VendorPortalService } from './vendor-portal.service';
import {
  vendorRegisterSchema, vendorLoginSchema,
  vendorProfileUpdateSchema, vendorSubmissionSchema,
} from './vendor-portal.schema';
import type { VendorJwtPayload } from './vendor-portal.service';

// Extend express Request to carry vendorUser
declare module 'express-serve-static-core' {
  interface Request {
    vendorUser?: VendorJwtPayload;
  }
}

const svc = new VendorPortalService();

export const registerVendor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = vendorRegisterSchema.parse(req.body);
    const account = await svc.register(data);
    res.status(201).json({ success: true, data: { id: account.id, companyName: account.companyName, status: account.status } });
  } catch (err) { next(err); }
};

export const loginVendor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = vendorLoginSchema.parse(req.body);
    const result = await svc.login(data);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const getVendorProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await svc.getProfile(req.vendorUser!.vendorAccountId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const updateVendorProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = vendorProfileUpdateSchema.parse(req.body);
    const result = await svc.updateProfile(req.vendorUser!.vendorAccountId, data);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const getVendorScores = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await svc.getOwnScores(req.vendorUser!.vendorAccountId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const submitVendorChallenge = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = vendorSubmissionSchema.parse(req.body);
    const result = await svc.submitChallenge(req.vendorUser!.vendorAccountId, data);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const listVendorSubmissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await svc.listSubmissions(req.vendorUser!.vendorAccountId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const getVendorAnalytics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await svc.getAnalytics(req.vendorUser!.vendorAccountId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};
