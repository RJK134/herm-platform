import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as aiAssistant from '../../services/ai-assistant';

const sendMessageSchema = z.object({
  sessionId: z.string().min(1).max(128),
  // Limit message length to prevent prompt injection / abuse; strip surrounding whitespace
  message: z.string().min(1, 'message cannot be empty').max(2000, 'message too long (max 2000 characters)').trim(),
});

export const sendMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid request body' },
      });
      return;
    }
    const { sessionId, message } = parsed.data;

    const reply = await aiAssistant.chat(sessionId, message);
    res.json({ success: true, data: { reply, sessionId } });
  } catch (err) {
    next(err);
  }
};

export const getHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const data = await aiAssistant.getHistory(sessionId as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const clearHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { sessionId } = req.params;
    await aiAssistant.clearHistory(sessionId as string);
    res.json({ success: true, data: { cleared: true } });
  } catch (err) {
    next(err);
  }
};
