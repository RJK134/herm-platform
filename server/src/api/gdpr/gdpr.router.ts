/**
 * GDPR data-subject endpoints router (Phase 10.8).
 *
 * Mounted at /api/me. The /me prefix is intentional — these are
 * personal rights, not admin actions. SUPER_ADMIN can act on someone
 * else's behalf via the impersonation flow (Phase 10.3) — there's no
 * reason to bypass the impersonation audit trail with a direct
 * admin-only path.
 */
import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth';
import { exportMyData, eraseMyAccount } from './gdpr.controller';

const router = Router();

router.use(authenticateJWT);

router.get('/data-export', exportMyData);
router.post('/erase', eraseMyAccount);

export default router;
