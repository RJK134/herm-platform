import { Router } from 'express';
import { authenticateJWT, requireRole } from '../../middleware/auth';
import {
  listVendorAccounts,
  updateVendorAccount,
  listAllSubmissions,
  getVendorSubmissions,
  reviewSubmission,
} from './admin-vendors.controller';
import { startImpersonation, endImpersonation } from './impersonation.controller';

const router = Router();

// Impersonation lives under /api/admin but uses its own role guard:
//   - start: SUPER_ADMIN only (enforced inside the controller)
//   - end:   any authenticated user holding an active impersonation token
// Both routes need authenticateJWT but NOT the INSTITUTION_ADMIN guard,
// so they're declared BEFORE the role-restricted block below. The end
// route is intentionally not role-gated — once a SUPER_ADMIN has started
// impersonating, the bearer's role is the customer's, and the controller
// validates the impersonator claim itself.
router.post('/impersonate', authenticateJWT, startImpersonation);
router.post('/impersonate/end', authenticateJWT, endImpersonation);

// All other admin routes require a valid JWT and INSTITUTION_ADMIN or SUPER_ADMIN role
router.use(authenticateJWT, requireRole(['SUPER_ADMIN', 'INSTITUTION_ADMIN']));

router.get('/vendors', listVendorAccounts);
router.patch('/vendors/:id', updateVendorAccount);
router.get('/vendors/:id/submissions', getVendorSubmissions);
router.get('/submissions', listAllSubmissions);
router.patch('/submissions/:id', reviewSubmission);

export default router;
