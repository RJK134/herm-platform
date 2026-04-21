import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateJWT } from '../../middleware/auth';
import { frameworkContext } from '../../middleware/framework-context';
import { validateBody } from '../../middleware/validate';
import { sendMessageSchema } from './chat.schema';
import { sendMessage, getHistory, clearHistory } from './chat.controller';

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many chat requests; slow down.' },
  },
});

router.use(authenticateJWT);
router.post('/', frameworkContext, chatLimiter, validateBody(sendMessageSchema), sendMessage);
router.get('/sessions/:sessionId', getHistory);
router.delete('/sessions/:sessionId', clearHistory);

export default router;
