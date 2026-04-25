import { Router } from 'express';
import { authenticateJWT, optionalJWT } from '../../middleware/auth';
import { calculateValue, saveAnalysis, listAnalyses, getAnalysis, getBenchmarks } from './value.controller';

const router = Router();

/** GET /api/value/benchmarks — UK HE benchmark data, public (read-only) */
router.get('/benchmarks', getBenchmarks);

/** POST /api/value/calculate — stateless calculation (no save). Public. */
router.post('/calculate', optionalJWT, calculateValue);

// Persisted analyses are tenant-scoped per HERM_COMPLIANCE.md
// "Authenticated (any tier)". JWT required so `institutionId` is always
// stamped from the token, never absent.
router.use(authenticateJWT);

/** POST /api/value — save analysis */
router.post('/', saveAnalysis);

/** GET /api/value — list saved analyses */
router.get('/', listAnalyses);

/** GET /api/value/:id */
router.get('/:id', getAnalysis);

export default router;
