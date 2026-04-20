import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import type { VendorJwtPayload } from '../api/vendor-portal/vendor-portal.service';

// JWT_SECRET is validated at startup in auth.ts — safe to read here
const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret';

/** Requires a valid vendor JWT (type === 'vendor') — 401 if missing/invalid */
export function requireVendorAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'AUTHENTICATION_ERROR', message: 'Vendor token required' } });
    return;
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as VendorJwtPayload;
    if (payload.type !== 'vendor') throw new Error('Not a vendor token');
    req.vendorUser = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid vendor token' } });
  }
}
