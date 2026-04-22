import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as aiAssistant from '../../services/ai/ai-assistant';
import { AppError, AuthError } from '../../utils/errors';
import { ok } from '../../lib/respond';

const sendMessageSchema = z.object({
  sessionId: z.string().min(1).max(128),
  message: z
    .string()
    .min(1, 'message cannot be empty')
    .max(2000, 'message too long (max 2000 characters)')
    .trim(),
});

const sessionParamSchema = z.object({
  sessionId: z.string().min(1).max(128),
});

function requireUser(req: Request): string {
  if (!req.user?.userId) throw new AuthError('Authentication required');
  return req.user.userId;
}

/**
 * `frameworkContext` populates `req.framework` (or 404s before we get here).
 * If it's still undefined, the router was mis-wired — fail loudly rather than
 * running an unscoped query that would mix cross-framework scores, *and*
 * avoid handing the AI a generic/incorrect framework label.
 */
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
