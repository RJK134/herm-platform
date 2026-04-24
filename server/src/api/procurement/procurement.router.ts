import { Router } from 'express';
import { authenticateJWT, optionalJWT } from '../../middleware/auth';
import {
  createProject, listProjects, getProject, updateProject, deleteProject,
  getWorkflow, updateStage, advanceWorkflow,
  addShortlistEntry, getShortlist, updateShortlistEntry, removeShortlistEntry,
  transitionProjectStatus, getProjectStatus,
  decideShortlistEntry, clearShortlistDecision,
  seedShortlistFromBasket,
} from './procurement.controller';
import {
  createProjectV2, listProjectsV2, getProjectV2, advanceStage,
  updateTask, updateApproval, getCompliance, getTimeline,
  addEvaluation, getEvaluations, updateEvaluation, getShortlistV2, importBasketShortlistV2,
  listJurisdictions, getJurisdiction, getSpecification,
} from './procurement-engine.controller';

const router = Router();
router.use(optionalJWT);

// ── Jurisdictions ─────────────────────────────────────────────────────────────
router.get('/jurisdictions', listJurisdictions);
router.get('/jurisdictions/:code', getJurisdiction);

// ── Phase 4 — v2 Project API (enhanced with stages) ──────────────────────────
// State-changing endpoints require a real JWT: creating a project stamps
// institutionId from the token, and stage / task / approval / evaluation
// mutations record governance state that audit logs key off. Reads stay
// on the router-level `optionalJWT` so anonymous dashboards still work.
router.post('/v2/projects', authenticateJWT, createProjectV2);
router.get('/v2/projects', listProjectsV2);
router.get('/v2/projects/:id', getProjectV2);

// Stage management — JWT required (state transitions feed audit trail)
router.post('/v2/projects/:id/advance', authenticateJWT, advanceStage);
router.patch('/v2/projects/:id/stages/:stageId/tasks/:taskId', authenticateJWT, updateTask);
router.patch('/v2/projects/:id/stages/:stageId/approvals/:approvalId', authenticateJWT, updateApproval);

// Compliance & timeline
router.get('/v2/projects/:id/compliance', getCompliance);
router.get('/v2/projects/:id/timeline', getTimeline);

// Evaluation — mutations need a real evaluator identity, not 'anonymous'
router.post('/v2/projects/:id/evaluations', authenticateJWT, addEvaluation);
router.get('/v2/projects/:id/evaluations', getEvaluations);
router.patch('/v2/projects/:id/evaluations/:evalId', authenticateJWT, updateEvaluation);
router.get('/v2/projects/:id/shortlist', getShortlistV2);
router.post('/v2/projects/:id/shortlist/import-basket', authenticateJWT, importBasketShortlistV2);

// Specification from basket
router.get('/v2/projects/:id/specification', getSpecification);

// ── v1 routes (preserved for backward compatibility) ─────────────────────────
router.post('/projects', createProject);
router.get('/projects', listProjects);
router.get('/projects/:id', getProject);
router.patch('/projects/:id', updateProject);
router.delete('/projects/:id', deleteProject);
router.get('/projects/:id/workflow', getWorkflow);
router.patch('/projects/:id/workflow/stages/:stageNum', updateStage);
router.post('/projects/:id/workflow/advance', advanceWorkflow);
router.post('/projects/:id/shortlist', addShortlistEntry);
router.get('/projects/:id/shortlist', getShortlist);
// PATCH echoes the full row (including governance columns) on success,
// so it must require an authenticated caller — otherwise an anonymous
// empty-body PATCH becomes an unauthenticated read of `decidedBy` /
// `rationale` that the GET endpoints carefully scrub.
router.patch('/projects/:id/shortlist/:entryId', authenticateJWT, updateShortlistEntry);
router.delete('/projects/:id/shortlist/:entryId', removeShortlistEntry);

// Phase 4: seed the shortlist from the project's linked basket. Writes
// an AuditLog row with the full ranking so a seed is always
// reconstructable, even after the basket evolves — hence JWT-only.
router.post(
  '/projects/:id/shortlist/seed-from-basket',
  authenticateJWT,
  seedShortlistFromBasket,
);

// ── Phase 3: governance ───────────────────────────────────────────────────
// Mutations require a real JWT so audit-log `userId` + `actorName` are
// never null. An unauthenticated transition would silently degrade the
// governance surface that Phase 3 exists to deliver. Reads stay on
// `optionalJWT` (inherited at the router level) — the status endpoint is
// useful for dashboards that don't have a logged-in session yet.
router.get('/projects/:id/status', getProjectStatus);
router.post('/projects/:id/status/transitions', authenticateJWT, transitionProjectStatus);

// Shortlist decisions — approve/reject with mandatory rationale.
router.post(
  '/projects/:id/shortlist/:entryId/decisions',
  authenticateJWT,
  decideShortlistEntry,
);
router.delete(
  '/projects/:id/shortlist/:entryId/decisions',
  authenticateJWT,
  clearShortlistDecision,
);

export default router;
