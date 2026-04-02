import { Router } from 'express';
import { optionalJWT } from '../../middleware/auth';
import { calculateValue, saveAnalysis, listAnalyses, getAnalysis, getBenchmarks } from './value.controller';

const router = Router();
router.use(optionalJWT);

/** GET /api/value/benchmarks — UK HE benchmark data */
router.get('/benchmarks', getBenchmarks);

/** POST /api/value/calculate — stateless calculation (no save) */
router.post('/calculate', calculateValue);

/** POST /api/value — save analysis */
router.post('/', saveAnalysis);

/** GET /api/value — list saved analyses */
router.get('/', listAnalyses);

/** GET /api/value/:id */
router.get('/:id', getAnalysis);

export default router;
