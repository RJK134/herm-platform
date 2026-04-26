import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth';
import {
  createAssessment,
  listAssessments,
  getAssessment,
} from './integration.controller';

const router = Router();

// Integration assessments are tenant-scoped persisted artefacts. Although
// HERM_COMPLIANCE.md previously listed `/api/integration` as a "stateless
// calculator", the controller has always persisted to `IntegrationAssessment`
// — that mismatch is resolved here in favour of the tenant-isolation
// invariant: institutionId is stamped from the JWT on every create, and every
// read filters by the caller's institutionId.
router.use(authenticateJWT);

router.post('/assess', createAssessment);
router.get('/assess', listAssessments);
router.get('/assess/:id', getAssessment);

export default router;
