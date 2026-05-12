import prisma from '../../utils/prisma';
import { ForbiddenError } from '../../utils/errors';
import { PRODUCT } from '../../lib/branding';
import {
  AI_LIMITS,
  createCompletion,
  isAiConfigured,
  sanitiseUserInput,
  AiNotConfiguredError,
} from './ai-client';

export function buildSystemPrompt(frameworkName: string): string {
  return `You are the ${PRODUCT.name} Assistant, an expert in UK higher education IT systems procurement and the in-app assistant for ${PRODUCT.name} (${PRODUCT.longName}). The active capability framework for this conversation is "${frameworkName}". You have knowledge of UCISA HERM v3.1 (the free reference model included with ${PRODUCT.name}), the Future Horizons Education (FHE) Capability Framework, and major SIS/LMS/CRM vendors. When citing capabilities, use codes from the active framework (e.g. BC011, BC086 for HERM). Give balanced vendor assessments — never recommend a specific vendor. Keep responses concise and structured.`;
}

const FALLBACK_RESPONSE = [
  'The AI Assistant requires an ANTHROPIC_API_KEY environment variable to function. Please add it to your .env file.',
  '',
  'In the meantime, you can:',
  '- Browse the **Leaderboard** for ranked system comparisons',
  '- Use the **Radar Comparison** to compare up to 5 systems visually',
  '- Build a **Capability Basket** to score systems against your requirements',
  '- Check the **How It Works** guide for scoring methodology',
].join('\n');

/**
 * Guard: a chat session may only be accessed by the user who created it.
 * Anonymous sessions (historical data with userId=null) cannot be resumed
 * by authenticated users — this prevents session-id snooping.
 */
async function assertSessionOwnership(sessionId: string, userId: string): Promise<void> {
  const existing = await prisma.chatMessage.findFirst({
    where: { sessionId },
    select: { userId: true },
  });
  if (existing && existing.userId !== userId) {
    throw new ForbiddenError('This chat session belongs to another user');
  }
}

export interface ChatParams {
  sessionId: string;
  userId: string;
  userMessage: string;
  requestId?: string;
  /**
   * Scope the AI's "current platform context" summary to a single framework.
   * Both `id` and `name` are used:
   *   - `id` filters the `CapabilityScore` relation so only scores for this
   *     framework enter the prompt (no cross-framework data bleed).
   *   - `name` is the human-readable label embedded in the system prompt and
   *     each system's coverage line, so the AI is told which framework's
   *     scores it is reading.
   *
   * **Required.** HTTP callers get it from `req.framework` (populated by the
   * `frameworkContext` middleware, which 404s if no framework is resolvable).
   * Non-HTTP callers must resolve a framework themselves before calling `chat`.
   */
  framework: { id: string; name: string };
}

export async function chat(params: ChatParams): Promise<string> {
  if (!isAiConfigured()) {
    return FALLBACK_RESPONSE;
  }

  const { sessionId, userId, requestId, framework } = params;
  const userMessage = sanitiseUserInput(params.userMessage);

  await assertSessionOwnership(sessionId, userId);

  const history = await prisma.chatMessage.findMany({
    where: { sessionId, userId },
    orderBy: { createdAt: 'asc' },
    take: AI_LIMITS.maxHistoryMessages,
  });

  const systems = await prisma.vendorSystem.findMany({
    include: {
      // CapabilityScore is framework-scoped; the filter is mandatory to avoid
      // cross-framework data bleed into the AI prompt context.
      scores: {
        where: { frameworkId: framework.id },
        select: { value: true },
      },
    },
    take: 21,
  });

  const systemSummary = systems
    .map((s) => {
      const total = s.scores.reduce((sum, sc) => sum + sc.value, 0);
      const max = s.scores.length * 100;
      const pct = max > 0 ? Math.round((total / max) * 100) : 0;
      return `${s.name} (${s.category}): ${pct}% overall ${framework.name} coverage`;
    })
    .join('\n');

  const messages = [
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage },
  ];

  await prisma.chatMessage.create({
    data: { sessionId, userId, role: 'user', content: userMessage },
  });

  try {
    const result = await createCompletion({
      model: 'claude-sonnet-4-20250514',
      systemPrompt: `${buildSystemPrompt(framework.name)}\n\nCurrent platform context:\n${systemSummary}`,
      messages,
      requestId,
      userId,
      sessionId,
    });

    await prisma.chatMessage.create({
      data: { sessionId, userId, role: 'assistant', content: result.text },
    });

    return result.text;
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return FALLBACK_RESPONSE;
    throw err;
  }
}

export async function getHistory(sessionId: string, userId: string) {
  await assertSessionOwnership(sessionId, userId);
  return prisma.chatMessage.findMany({
    where: { sessionId, userId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function clearHistory(sessionId: string, userId: string): Promise<void> {
  await assertSessionOwnership(sessionId, userId);
  await prisma.chatMessage.deleteMany({ where: { sessionId, userId } });
}
