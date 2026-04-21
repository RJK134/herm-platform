import { Router } from 'express';
import {
  registerVendor, loginVendor, getVendorProfile, updateVendorProfile,
  getVendorScores, submitVendorChallenge, listVendorSubmissions, getVendorAnalytics,
} from './vendor-portal.controller';
import { requireVendorAuth } from '../../middleware/vendor-auth';
import { vendorPortalRateLimiter } from '../../middleware/security';

const router = Router();
const protectedVendorRoute = [vendorPortalRateLimiter, requireVendorAuth] as const;

// Public
router.post('/register', registerVendor);
router.post('/login', loginVendor);

// Protected
router.get('/profile', ...protectedVendorRoute, getVendorProfile);
router.put('/profile', ...protectedVendorRoute, updateVendorProfile);
router.get('/scores', ...protectedVendorRoute, getVendorScores);
router.post('/submissions', ...protectedVendorRoute, submitVendorChallenge);
router.get('/submissions', ...protectedVendorRoute, listVendorSubmissions);
router.get('/analytics', ...protectedVendorRoute, getVendorAnalytics);

export default router;
