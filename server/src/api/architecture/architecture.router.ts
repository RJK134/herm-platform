import { Router } from 'express';
import { authenticateJWT, optionalJWT } from '../../middleware/auth';
import { createAssessment, listAssessments, getAssessment, deleteAssessment, analysePreview } from './architecture.controller';

const router = Router();

/**
 * POST /api/architecture/analyse — stateless preview (no save).
 * Stays anonymous-friendly to match the calculator UX; `optionalJWT`
 * still lets an authenticated caller pass institutionId through.
 */
router.post('/analyse', optionalJWT, analysePreview);

// Persisted assessments are tenant-scoped per HERM_COMPLIANCE.md
// "Authenticated (any tier)". A real JWT is required so the controller's
// `data.institutionId = req.user.institutionId` stamping is never skipped.
router.use(authenticateJWT);

/** POST /api/architecture — save assessment */
router.post('/', createAssessment);

/** GET /api/architecture — list assessments */
router.get('/', listAssessments);

/** GET /api/architecture/:id — get by id */
router.get('/:id', getAssessment);

/** DELETE /api/architecture/:id — delete */
router.delete('/:id', deleteAssessment);

export default router;
