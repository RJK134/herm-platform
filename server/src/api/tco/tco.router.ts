import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth';
import {
  getBenchmarks,
  getBenchmark,
  calculate,
  compare,
  saveEstimate,
  listEstimates,
  getEstimate,
} from './tco.controller';

const router = Router();

// Benchmark + calculation endpoints stay public (stateless).
router.get('/benchmarks', getBenchmarks);
router.get('/benchmarks/:slug', getBenchmark);
router.post('/calculate', calculate);
router.post('/compare', compare);

// Phase 4: persisted estimates are tenant-scoped data. Require a JWT
// on mutations and reads so the `createdById` / `institutionId` fields
// the service stamps from `req.user` are never null / spoofable.
router.post('/estimates', authenticateJWT, saveEstimate);
router.get('/estimates', authenticateJWT, listEstimates);
router.get('/estimates/:id', authenticateJWT, getEstimate);

export default router;
