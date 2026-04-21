import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth';
import { sendMessage, getHistory, clearHistory } from './chat.controller';

const router = Router();

// All chat endpoints require authentication — see docs/AI_GOVERNANCE.md
router.use(authenticateJWT);

router.post('/', sendMessage);
router.get('/sessions/:sessionId', getHistory);
router.delete('/sessions/:sessionId', clearHistory);

export default router;
