import { Request, Response, NextFunction } from 'express';
import * as aiAssistant from '../../services/ai-assistant';
import type { SendMessageInput } from './chat.schema';

export const sendMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Body validation is performed by `validateBody(sendMessageSchema)` in the router,
    // so req.body is already the parsed, typed shape here.
    const { sessionId, message } = req.body as SendMessageInput;
    const reply = await aiAssistant.chat(sessionId, message, {
      reqId: String(req.id),
      userId: req.user?.userId,
    });
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
