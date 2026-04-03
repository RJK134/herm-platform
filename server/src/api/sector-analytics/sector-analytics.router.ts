import { Router } from 'express';
import { optionalJWT } from '../../middleware/auth';
import { getOverview, getSystems, getCapabilities, getJurisdictions, getTrends } from './sector-analytics.controller';

const router = Router();
router.use(optionalJWT);

router.get('/overview', getOverview);
router.get('/systems', getSystems);
router.get('/capabilities', getCapabilities);
router.get('/jurisdictions', getJurisdictions);
router.get('/trends', getTrends);

export default router;
