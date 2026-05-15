import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth';
import { getUsage } from './usage.controller';

const router = Router();

// All usage reads are tenant-scoped — `institutionId` comes from the
// JWT, not the URL. Anonymous callers don't have a meaningful "usage";
// 401 them up front rather than rendering an empty array.
router.use(authenticateJWT);

/** GET /api/usage — current-period quota state for the caller's institution. */
router.get('/', getUsage);

export default router;
