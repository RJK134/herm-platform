import { Router } from 'express';
import { optionalJWT } from '../../middleware/auth';
import {
  listVendorAccounts,
  updateVendorAccount,
  getVendorSubmissions,
  reviewSubmission,
} from './admin-vendors.controller';

const router = Router();
router.use(optionalJWT);

router.get('/vendors', listVendorAccounts);
router.patch('/vendors/:id', updateVendorAccount);
router.get('/vendors/:id/submissions', getVendorSubmissions);
router.patch('/submissions/:id', reviewSubmission);

export default router;
