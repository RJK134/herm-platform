import { Router } from 'express';
import { optionalJWT } from '../../middleware/auth';
import {
  createProject, listProjects, getProject, updateProject, deleteProject,
  getWorkflow, updateStage, advanceWorkflow,
  addShortlistEntry, getShortlist, updateShortlistEntry, removeShortlistEntry,
} from './procurement.controller';
import {
  createProjectV2, listProjectsV2, getProjectV2, advanceStage,
  updateTask, updateApproval, getCompliance, getTimeline,
  addEvaluation, getEvaluations, updateEvaluation,
  listJurisdictions, getJurisdiction, getSpecification,
} from './procurement-engine.controller';

const router = Router();
router.use(optionalJWT);

// ── Jurisdictions ─────────────────────────────────────────────────────────────
router.get('/jurisdictions', listJurisdictions);
router.get('/jurisdictions/:code', getJurisdiction);

// ── Phase 4 — v2 Project API (enhanced with stages) ──────────────────────────
router.post('/v2/projects', createProjectV2);
router.get('/v2/projects', listProjectsV2);
router.get('/v2/projects/:id', getProjectV2);

// Stage management
router.post('/v2/projects/:id/advance', advanceStage);
router.patch('/v2/projects/:id/stages/:stageId/tasks/:taskId', updateTask);
router.patch('/v2/projects/:id/stages/:stageId/approvals/:approvalId', updateApproval);

// Compliance & timeline
router.get('/v2/projects/:id/compliance', getCompliance);
router.get('/v2/projects/:id/timeline', getTimeline);

// Evaluation
router.post('/v2/projects/:id/evaluations', addEvaluation);
router.get('/v2/projects/:id/evaluations', getEvaluations);
router.patch('/v2/projects/:id/evaluations/:evalId', updateEvaluation);

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
router.patch('/projects/:id/shortlist/:entryId', updateShortlistEntry);
router.delete('/projects/:id/shortlist/:entryId', removeShortlistEntry);

export default router;
