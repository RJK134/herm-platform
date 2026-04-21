import prisma from '../../utils/prisma';
import { ForbiddenError } from '../../utils/errors';
import {
  AI_LIMITS,
  createCompletion,
  isAiConfigured,
  sanitiseUserInput,
  AiNotConfiguredError,
} from './ai-client';

const SYSTEM_PROMPT = `You are the HERM Procurement Assistant, an expert in UK higher education IT systems procurement. You have deep knowledge of UCISA HERM v3.1, the 165 capability framework, and all major SIS/LMS/CRM vendors. You help universities evaluate and compare systems. Be specific, cite HERM capability codes (e.g. BC011, BC086), and give balanced vendor assessments. Never recommend a specific vendor — present evidence and let the user decide. Keep responses concise and structured.`;

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
   * `CapabilityScore` is framework-scoped, so without this filter the summary
   * mixes scores from HERM + FHE (and any other frameworks) which misleads
   * the model. Pass `req.frameworkId` (populated by the framework-context
   * middleware). Leave undefined to preserve legacy behaviour.
   */
  frameworkId?: string;
}

export async function chat(params: ChatParams): Promise<string> {
  if (!isAiConfigured()) {
    return FALLBACK_RESPONSE;
  }

  const { sessionId, userId, requestId, frameworkId } = params;
  const userMessage = sanitiseUserInput(params.userMessage);

  await assertSessionOwnership(sessionId, userId);

  const history = await prisma.chatMessage.findMany({
    where: { sessionId, userId },
    orderBy: { createdAt: 'asc' },
    take: AI_LIMITS.maxHistoryMessages,
  });

  const systems = await prisma.vendorSystem.findMany({
    include: {
      scores: {
        where: frameworkId ? { frameworkId } : undefined,
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
      return `${s.name} (${s.category}): ${pct}% overall HERM coverage`;
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
      systemPrompt: `${SYSTEM_PROMPT}\n\nCurrent platform context:\n${systemSummary}`,
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
