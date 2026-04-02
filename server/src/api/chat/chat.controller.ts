import { Request, Response, NextFunction } from 'express';
import * as aiAssistant from '../../services/ai-assistant';

export const sendMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { sessionId, message } = req.body as { sessionId: string; message: string };

    if (!sessionId || !message) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'sessionId and message are required' },
      });
      return;
    }

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
