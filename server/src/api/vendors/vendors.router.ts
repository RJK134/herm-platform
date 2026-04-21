import { Router } from 'express';
import { authenticateJWT, requireRole } from '../../middleware/auth';
import { getProfile, updateProfile, getVersions } from './vendors.controller';

const router = Router();

router.get('/:id/profile', getProfile);
router.put(
  '/:id/profile',
  authenticateJWT,
  requireRole(['INSTITUTION_ADMIN', 'SUPER_ADMIN', 'VENDOR_ADMIN']),
  updateProfile,
);
router.get('/:id/versions', getVersions);

export default router;
