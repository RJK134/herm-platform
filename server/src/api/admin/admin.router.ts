import { Router } from 'express';
import { authenticateJWT, requireRole } from '../../middleware/auth';
import {
  listVendorAccounts,
  updateVendorAccount,
  getVendorSubmissions,
  reviewSubmission,
} from './admin-vendors.controller';

const router = Router();

// All admin routes require a valid JWT and INSTITUTION_ADMIN or SUPER_ADMIN role
router.use(authenticateJWT, requireRole(['SUPER_ADMIN', 'INSTITUTION_ADMIN']));

router.get('/vendors', listVendorAccounts);
router.patch('/vendors/:id', updateVendorAccount);
router.get('/vendors/:id/submissions', getVendorSubmissions);
router.patch('/submissions/:id', reviewSubmission);

export default router;
