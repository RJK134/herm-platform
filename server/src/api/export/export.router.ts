import { Router } from 'express';
import { leaderboardCsv, heatmapCsv, fullReportJson } from './export.controller';

const router = Router();

router.get('/leaderboard.csv', leaderboardCsv);
router.get('/heatmap.csv', heatmapCsv);
router.get('/report.json', fullReportJson);

export default router;
