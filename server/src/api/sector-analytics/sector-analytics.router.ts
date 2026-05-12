import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth';
import { requirePaidTier } from '../../middleware/require-paid-tier';
import { getOverview, getSystems, getCapabilities, getJurisdictions, getTrends } from './sector-analytics.controller';

const router = Router();

// Sector Intelligence is a paid-tier feature per the navigation contract
// in `client/src/lib/navigation.ts` (`tier: ['pro', 'enterprise']`) and
// the IA table in HERM_COMPLIANCE.md "Navigation and IA". The previous
// `optionalJWT` only enforced k-anonymity (≥ 5 institutions) on three of
// five endpoints, leaving `jurisdictions` and `trends` exposed to free /
// anonymous callers. Apply the same gate the client mirrors via
// `<RequireTier>` so the paid/free boundary is enforced server-side too.
//
// Anonymous callers get 401 AUTHENTICATION_ERROR (the axios interceptor
// then redirects to /login?returnTo=…). Free-tier callers get 403
// SUBSCRIPTION_REQUIRED with `details.requiredTiers: ['pro',
// 'enterprise']`, matching the rest of the paid-feature surface.
router.use(authenticateJWT, requirePaidTier(['pro', 'enterprise']));

router.get('/overview', getOverview);
router.get('/systems', getSystems);
router.get('/capabilities', getCapabilities);
router.get('/jurisdictions', getJurisdictions);
router.get('/trends', getTrends);

export default router;
