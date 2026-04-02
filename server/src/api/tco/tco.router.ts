import { Router } from 'express';
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

// Benchmark endpoints
router.get('/benchmarks', getBenchmarks);
router.get('/benchmarks/:slug', getBenchmark);

// Calculation endpoints
router.post('/calculate', calculate);
router.post('/compare', compare);

// Saved estimates
router.post('/estimates', saveEstimate);
router.get('/estimates', listEstimates);
router.get('/estimates/:id', getEstimate);

export default router;
