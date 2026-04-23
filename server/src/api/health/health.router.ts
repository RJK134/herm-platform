import { Router } from 'express';
import { liveness, readiness } from './health.controller';

const router = Router();

router.get('/health', liveness);
router.get('/readiness', readiness);

export default router;
