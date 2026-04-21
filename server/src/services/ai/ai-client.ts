import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../lib/logger';

/**
 * Centralised AI client. This is the ONLY module allowed to import
 * `@anthropic-ai/sdk` (enforced via ESLint no-restricted-imports).
 *
 * Responsibilities:
 *   - Enforce a model allowlist.
 *   - Apply hard caps on input/output size and message counts.
 *   - Strip common prompt-injection markers from user-supplied text.
 *   - Emit structured logs for every call (observability + cost attribution).
 *
 * The rest of the codebase consumes this module via `createCompletion`.
 */

const ALLOWED_MODELS = ['claude-sonnet-4-20250514'] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];

export const AI_LIMITS = {
  maxInputChars: 2000,
  maxHistoryMessages: 20,
  maxSystemPromptChars: 8000,
  maxOutputTokens: 1024,
} as const;

const INJECTION_MARKERS = [
  /\b(system|assistant|user)\s*:\s*$/gim,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
];

export class AiNotConfiguredError extends Error {
  constructor() {
    super('AI is not configured on this instance (ANTHROPIC_API_KEY missing)');
    this.name = 'AiNotConfiguredError';
  }
}

export class AiLimitExceededError extends Error {
  constructor(what: string) {
    super(`AI request exceeds limit: ${what}`);
    this.name = 'AiLimitExceededError';
  }
}

export function sanitiseUserInput(raw: string): string {
  // Strip ASCII control characters (C0 + DEL). The literal control-char range
  // in the regex is intentional — that's exactly what we want to remove.
  // eslint-disable-next-line no-control-regex
  let cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  for (const marker of INJECTION_MARKERS) {
    cleaned = cleaned.replace(marker, '[filtered]');
  }
  if (cleaned.length > AI_LIMITS.maxInputChars) {
    throw new AiLimitExceededError(`input too long (max ${AI_LIMITS.maxInputChars} chars)`);
  }
  return cleaned;
}

function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

export function isAiConfigured(): boolean {
  return Boolean(process.env['ANTHROPIC_API_KEY']);
}

export interface CompletionRequest {
  model: AllowedModel;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  requestId?: string;
  userId?: string;
  sessionId?: string;
}

export interface CompletionResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

/**
 * Run a bounded, observable Claude completion. Throws `AiNotConfiguredError`
 * if no API key is set, and `AiLimitExceededError` if the inputs exceed
 * configured caps. Every call emits a structured log line.
 */
export async function createCompletion(req: CompletionRequest): Promise<CompletionResult> {
  if (!ALLOWED_MODELS.includes(req.model)) {
    throw new AiLimitExceededError(`model '${req.model}' is not in the allowlist`);
  }
  if (req.systemPrompt.length > AI_LIMITS.maxSystemPromptChars) {
    throw new AiLimitExceededError(`system prompt too long (max ${AI_LIMITS.maxSystemPromptChars} chars)`);
  }
  if (req.messages.length > AI_LIMITS.maxHistoryMessages + 1) {
    throw new AiLimitExceededError(
      `too many messages (max ${AI_LIMITS.maxHistoryMessages + 1} including current)`,
    );
  }

  const client = getAnthropicClient();
  if (!client) throw new AiNotConfiguredError();

  const start = Date.now();
  const response = await client.messages.create({
    model: req.model,
    max_tokens: AI_LIMITS.maxOutputTokens,
    system: req.systemPrompt,
    messages: req.messages,
  });
  const latencyMs = Date.now() - start;

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
  const tokensIn = response.usage?.input_tokens ?? 0;
  const tokensOut = response.usage?.output_tokens ?? 0;

  logger.info(
    {
      component: 'ai-client',
      requestId: req.requestId,
      userId: req.userId,
      sessionId: req.sessionId,
      model: req.model,
      tokensIn,
      tokensOut,
      latencyMs,
      outcome: 'ok',
    },
    'ai completion',
  );

  return { text, model: req.model, tokensIn, tokensOut, latencyMs };
}
