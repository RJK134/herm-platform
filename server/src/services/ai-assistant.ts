import Anthropic from '@anthropic-ai/sdk';
import prisma from '../utils/prisma';
import { logger } from '../utils/logger';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_HISTORY_MESSAGES = 20;

const client = process.env['ANTHROPIC_API_KEY']
  ? new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] })
  : null;

// In production, an unset API key is a misconfiguration — fail fast at startup
// instead of silently returning fallback copy to every user.
if (!client && process.env['NODE_ENV'] === 'production') {
  throw new Error('ANTHROPIC_API_KEY must be set in production');
}

const SYSTEM_PROMPT = `You are the HERM Procurement Assistant, an expert in UK higher education IT systems procurement. You have deep knowledge of UCISA HERM v3.1, the 165 capability framework, and all major SIS/LMS/CRM vendors. You help universities evaluate and compare systems. Be specific, cite HERM capability codes (e.g. BC011, BC086), and give balanced vendor assessments. Never recommend a specific vendor — present evidence and let the user decide. Keep responses concise and structured.`;

export interface ChatCallContext {
  reqId?: string;
  userId?: string;
}

const FALLBACK_REPLY =
  "The AI Assistant requires an ANTHROPIC_API_KEY environment variable to function. Please add it to your .env file.\n\nIn the meantime, you can:\n- Browse the **Leaderboard** for ranked system comparisons\n- Use the **Radar Comparison** to compare up to 5 systems visually\n- Build a **Capability Basket** to score systems against your requirements\n- Check the **How It Works** guide for scoring methodology";

export async function chat(
  sessionId: string,
  userMessage: string,
  ctx: ChatCallContext = {}
): Promise<string> {
  if (!client) {
    logger.warn({ reqId: ctx.reqId, userId: ctx.userId }, 'ai.chat called without ANTHROPIC_API_KEY');
    return FALLBACK_REPLY;
  }

  const history = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    take: MAX_HISTORY_MESSAGES,
  });

  const systems = await prisma.vendorSystem.findMany({
    include: { scores: { select: { value: true } } },
    take: 21,
  });

  const systemSummary = systems
    .map((s) => {
      const total = s.scores.reduce((sum, sc) => sum + sc.value, 0);
      const max = s.scores.length * 100;
      const pct = max > 0 ? Math.round((total / max) * 100) : 0;
      return `${s.name} (${s.category}): ${pct}% overall HERM coverage`;
    })
    .join('\n');

  const contextMessage = `Current platform context:\n${systemSummary}`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage },
  ];

  // Persist the user turn BEFORE calling the LLM so we don't lose it on failure.
  await prisma.chatMessage.create({
    data: { sessionId, role: 'user', content: userMessage },
  });

  // AbortController enforces a hard wall-clock timeout — the Anthropic SDK can
  // hang on network issues, which would otherwise tie up a server worker.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT + '\n\n' + contextMessage,
        messages,
      },
      { signal: controller.signal }
    );

    const durationMs = Date.now() - startedAt;
    const firstContent = response.content[0];
    const assistantContent = firstContent && firstContent.type === 'text' ? firstContent.text : '';

    logger.info(
      {
        reqId: ctx.reqId,
        userId: ctx.userId,
        sessionId,
        model: MODEL,
        durationMs,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        stopReason: response.stop_reason,
      },
      'ai.chat completed'
    );

    await prisma.chatMessage.create({
      data: { sessionId, role: 'assistant', content: assistantContent },
    });

    return assistantContent;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    logger.error(
      { err, reqId: ctx.reqId, userId: ctx.userId, sessionId, model: MODEL, durationMs },
      'ai.chat failed'
    );
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function getHistory(sessionId: string) {
  return prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function clearHistory(sessionId: string) {
  await prisma.chatMessage.deleteMany({ where: { sessionId } });
}
