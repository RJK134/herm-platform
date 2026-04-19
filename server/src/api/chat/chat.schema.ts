import { z } from 'zod';

/**
 * Chat input schema. Limits exist for two reasons:
 * 1. Cost control — every request consumes LLM tokens.
 * 2. Abuse defence — large payloads enable prompt-injection and DoS.
 */
export const sendMessageSchema = z.object({
  sessionId: z.string().min(1).max(128),
  message: z
    .string()
    .min(1, 'message cannot be empty')
    .max(2000, 'message too long (max 2000 characters)')
    .trim(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const sessionParamSchema = z.object({
  sessionId: z.string().min(1).max(128),
});
