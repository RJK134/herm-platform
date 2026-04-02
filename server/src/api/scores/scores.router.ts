import { Router } from 'express';
import { getLeaderboard, getHeatmap } from './scores.controller';

const router = Router();

router.get('/leaderboard', getLeaderboard);
router.get('/heatmap', getHeatmap);

export default router;
