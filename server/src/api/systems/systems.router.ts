import { Router } from 'express';
import { list, getById, getScores, compare } from './systems.controller';

const router = Router();

router.get('/', list);
router.get('/compare', compare);
router.get('/:id', getById);
router.get('/:id/scores', getScores);

export default router;
