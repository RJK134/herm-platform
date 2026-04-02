import { Router } from 'express';
import { optionalJWT } from '../../middleware/auth';
import { createAssessment, listAssessments, getAssessment, deleteAssessment, analysePreview } from './architecture.controller';

const router = Router();
router.use(optionalJWT);

/** POST /api/architecture/analyse — stateless preview (no save) */
router.post('/analyse', analysePreview);

/** POST /api/architecture — save assessment */
router.post('/', createAssessment);

/** GET /api/architecture — list assessments */
router.get('/', listAssessments);

/** GET /api/architecture/:id — get by id */
router.get('/:id', getAssessment);

/** DELETE /api/architecture/:id — delete */
router.delete('/:id', deleteAssessment);

export default router;
