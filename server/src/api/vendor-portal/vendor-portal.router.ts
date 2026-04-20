import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import {
  registerVendor, loginVendor, getVendorProfile, updateVendorProfile,
  getVendorScores, submitVendorChallenge, listVendorSubmissions, getVendorAnalytics,
} from './vendor-portal.controller';
import type { VendorJwtPayload } from './vendor-portal.service';

const router = Router();

// Re-use the validated secret from auth middleware (fails fast at startup if missing in production)
const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret';

// Middleware: require vendor JWT
function requireVendorAuth(req: Request, res: Response, next: NextFunction): void {
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

// Public
router.post('/register', registerVendor);
router.post('/login', loginVendor);

// Protected
router.get('/profile', requireVendorAuth, getVendorProfile);
router.put('/profile', requireVendorAuth, updateVendorProfile);
router.get('/scores', requireVendorAuth, getVendorScores);
router.post('/submissions', requireVendorAuth, submitVendorChallenge);
router.get('/submissions', requireVendorAuth, listVendorSubmissions);
router.get('/analytics', requireVendorAuth, getVendorAnalytics);

export default router;
