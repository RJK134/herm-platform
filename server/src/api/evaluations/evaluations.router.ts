import { Router } from 'express';
import { optionalJWT } from '../../middleware/auth';
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
router.use(optionalJWT);

router.post('/', createProject);
router.get('/', listProjects);
router.get('/:id', getProject);
router.patch('/:id', updateProject);
router.post('/:id/members', addMember);
router.delete('/:id/members/:memberId', removeMember);
router.post('/:id/systems', addSystem);
router.delete('/:id/systems/:sysId', removeSystem);
router.post('/:id/domains/assign', assignDomains);
router.get('/:id/domains', getDomainProgress);
router.post('/:id/domains/:domainId/scores', submitDomainScores);
router.get('/:id/aggregate', getAggregatedScores);
router.get('/:id/progress', getTeamProgress);

export default router;
