import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth';
import { frameworkContext } from '../../middleware/framework-context';
import { sendMessage, getHistory, clearHistory } from './chat.controller';

const router = Router();

// All chat endpoints require authentication — see docs/AI_GOVERNANCE.md
router.use(authenticateJWT);

// POST / needs an active framework so the AI's system-summary context is
// scoped to a single framework's scores. GET/DELETE session endpoints only
// touch ChatMessage rows and don't need it.
router.post('/', frameworkContext, sendMessage);
router.get('/sessions/:sessionId', getHistory);
router.delete('/sessions/:sessionId', clearHistory);

export default router;
