import { Router } from 'express';
import { authenticateJWT, optionalJWT } from '../../middleware/auth';
import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  addMember,
  removeMember,
  addSystem,
  removeSystem,
  assignDomains,
  getDomainProgress,
  submitDomainScores,
  getAggregatedScores,
  getTeamProgress,
} from './evaluations.controller';
import {
  submitOwnCoi,
  getOwnCoi,
  listProjectCoi,
} from './coi.controller';

const router = Router();
// Reads keep `optionalJWT` so tenant-scoped lists can still be served to
// authenticated callers, while anonymous callers see an empty list. Every
// MUTATION requires a real JWT — evaluations carry per-user attribution
// (leadUserId, member roles, score submitter) that must never fall back
// to the `'anonymous'` sentinel.
router.use(optionalJWT);

router.post('/', authenticateJWT, createProject);
router.get('/', listProjects);
router.get('/:id', getProject);
router.patch('/:id', authenticateJWT, updateProject);
router.post('/:id/members', authenticateJWT, addMember);
router.delete('/:id/members/:memberId', authenticateJWT, removeMember);
router.post('/:id/systems', authenticateJWT, addSystem);
router.delete('/:id/systems/:sysId', authenticateJWT, removeSystem);
router.post('/:id/domains/assign', authenticateJWT, assignDomains);
router.get('/:id/domains', getDomainProgress);
router.post('/:id/domains/:domainId/scores', authenticateJWT, submitDomainScores);
router.get('/:id/aggregate', getAggregatedScores);
router.get('/:id/progress', getTeamProgress);

// Phase 14.9 — Conflict-of-Interest declarations. Every endpoint
// requires a real JWT because (a) submit carries per-user audit
// attribution that must never fall back to the 'anonymous' sentinel,
// and (b) reads expose `declaredText` which can carry commercially-
// sensitive disclosure content. The list endpoint additionally
// gates on project membership AND tenant institutionId inside the
// service layer — non-members and cross-tenant probes both get
// 200 + [] (rather than 403) so probed project IDs can't be
// confirmed as existing.
router.post('/:id/coi', authenticateJWT, submitOwnCoi);
router.get('/:id/coi/me', authenticateJWT, getOwnCoi);
router.get('/:id/coi', authenticateJWT, listProjectCoi);

export default router;
