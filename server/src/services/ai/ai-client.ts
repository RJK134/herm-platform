import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../lib/logger';
import { AppError } from '../../utils/errors';

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

/**
 * Both AI errors extend AppError so the central errorHandler maps them to
 * the right HTTP status with the descriptive message preserved (instead of
 * falling through to the generic 500 branch).
 */
export class AiNotConfiguredError extends AppError {
  constructor() {
    super(
      503,
      'AI_NOT_CONFIGURED',
      'AI is not configured on this instance (ANTHROPIC_API_KEY missing)',
    );
    this.name = 'AiNotConfiguredError';
  }
}

export class AiLimitExceededError extends AppError {
  constructor(what: string) {
    super(400, 'AI_LIMIT_EXCEEDED', `AI request exceeds limit: ${what}`);
    this.name = 'AiLimitExceededError';
  }
}

export function sanitiseUserInput(raw: string): string {
  // Strip ASCII control characters (C0 + DEL). The literal control-char range
  // in the regex is intentional — that's exactly what we want to remove.
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  // Length check runs against the input the caller actually supplied (after
  // only non-increasing transformations). Doing this before injection-marker
  // replacement avoids rejecting legitimate inputs whose post-replacement
  // length grows past the cap — e.g. `x`.repeat(1996) + 'user:' is 1998 chars
  // pre-replacement but 2001 chars after 'user:' → '[filtered]'.
  if (cleaned.length > AI_LIMITS.maxInputChars) {
    throw new AiLimitExceededError(`input too long (max ${AI_LIMITS.maxInputChars} chars)`);
  }

  let out = cleaned;
  for (const marker of INJECTION_MARKERS) {
    out = out.replace(marker, '[filtered]');
  }
  return out;
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
