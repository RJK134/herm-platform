import { Router } from 'express';
import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  getWorkflow,
  updateStage,
  advanceWorkflow,
  addShortlistEntry,
  getShortlist,
  updateShortlistEntry,
  removeShortlistEntry,
} from './procurement.controller';

const router = Router();

// Project CRUD
router.post('/projects', createProject);
router.get('/projects', listProjects);
router.get('/projects/:id', getProject);
router.patch('/projects/:id', updateProject);
router.delete('/projects/:id', deleteProject);

// Workflow management
router.get('/projects/:id/workflow', getWorkflow);
router.patch('/projects/:id/workflow/stages/:stageNum', updateStage);
router.post('/projects/:id/workflow/advance', advanceWorkflow);

// Shortlist management
router.post('/projects/:id/shortlist', addShortlistEntry);
router.get('/projects/:id/shortlist', getShortlist);
router.patch('/projects/:id/shortlist/:entryId', updateShortlistEntry);
router.delete('/projects/:id/shortlist/:entryId', removeShortlistEntry);

export default router;
