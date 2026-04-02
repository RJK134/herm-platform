import { Router } from 'express';
import { sendMessage, getHistory, clearHistory } from './chat.controller';

const router = Router();

router.post('/', sendMessage);
router.get('/sessions/:sessionId', getHistory);
router.delete('/sessions/:sessionId', clearHistory);

export default router;
