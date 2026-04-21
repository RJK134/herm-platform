import { Router } from 'express';
import {
  registerVendor, loginVendor, getVendorProfile, updateVendorProfile,
  getVendorScores, submitVendorChallenge, listVendorSubmissions, getVendorAnalytics,
} from './vendor-portal.controller';
import { requireVendorAuth } from '../../middleware/vendor-auth';

const router = Router();

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
