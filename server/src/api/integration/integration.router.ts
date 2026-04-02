import { Router } from 'express';
import {
  createAssessment,
  listAssessments,
  getAssessment,
} from './integration.controller';

const router = Router();

router.post('/assess', createAssessment);
router.get('/assess', listAssessments);
router.get('/assess/:id', getAssessment);

export default router;
