import type { NextFunction, Request, Response } from 'express';
import * as aiAssistant from '../../services/ai/ai-assistant';
import { ok } from '../../lib/respond';
import { AppError, AuthError } from '../../utils/errors';
import { sendMessageSchema, sessionParamSchema } from './chat.schema';

function requireUser(req: Request): string {
  if (!req.user?.userId) throw new AuthError('Authentication required');
  return req.user.userId;
}
function requireFramework(req: Request): { id: string; name: string } {
  if (!req.framework?.id || !req.framework?.name) {
    throw new AppError(
      500,
      'INTERNAL_ERROR',
      'Framework context missing — POST /api/chat must mount frameworkContext middleware',
    );
  }
  return { id: req.framework.id, name: req.framework.name };
}

export const sendMessage = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const framework = requireFramework(req);
    const { sessionId, message } = sendMessageSchema.parse(req.body);
    const reply = await aiAssistant.chat({
      sessionId,
      userId,
      userMessage: message,
      requestId: String(req.id),
      framework,
    });
    ok(res, { reply, sessionId });
  } catch (err) {
    next(err);
  }
};

export const getHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const { sessionId } = sessionParamSchema.parse(req.params);
    const data = await aiAssistant.getHistory(sessionId, userId);
    ok(res, data);
  } catch (err) {
    next(err);
  }
};

export const clearHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const { sessionId } = sessionParamSchema.parse(req.params);
    await aiAssistant.clearHistory(sessionId, userId);
    ok(res, { cleared: true });
  } catch (err) {
    next(err);
  }
};
