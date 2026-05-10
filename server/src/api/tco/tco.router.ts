import { Router } from 'express';
import { authenticateJWT, requireRole } from '../../middleware/auth';
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

// Benchmark + calculation endpoints stay public (stateless). They expose
// HERM-published benchmark data and produce stateless calculations from
// caller-supplied inputs — no tenant data, no role gating.
router.get('/benchmarks', getBenchmarks);
router.get('/benchmarks/:slug', getBenchmark);
router.post('/calculate', calculate);
router.post('/compare', compare);

// Phase 4: persisted estimates are tenant-scoped data — JWT mandatory
// so the `createdById` / `institutionId` fields the service stamps from
// `req.user` are never null / spoofable.
//
// Phase 14.8 — gated to FINANCE / PROCUREMENT_LEAD / INSTITUTION_ADMIN /
// SUPER_ADMIN. UAT report 4.1 named FINANCE as the role with TCO-only
// access; PROCUREMENT_LEAD already has broader procurement access; the
// two admin roles keep their cross-cutting posture. EVALUATOR /
// AUDITOR / STAKEHOLDER / VIEWER deliberately don't reach this surface
// — TCO numbers are commercially sensitive and shouldn't be visible
// to broader read-only roles.
const tcoRoles = ['FINANCE', 'PROCUREMENT_LEAD', 'INSTITUTION_ADMIN', 'SUPER_ADMIN'];
router.post('/estimates', authenticateJWT, requireRole(tcoRoles), saveEstimate);
router.get('/estimates', authenticateJWT, requireRole(tcoRoles), listEstimates);
router.get('/estimates/:id', authenticateJWT, requireRole(tcoRoles), getEstimate);

export default router;
