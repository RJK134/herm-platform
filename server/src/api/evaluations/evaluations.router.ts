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

export default router;
