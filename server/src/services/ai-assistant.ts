import Anthropic from '@anthropic-ai/sdk';
import prisma from '../utils/prisma';

const client = process.env['ANTHROPIC_API_KEY']
  ? new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] })
  : null;

const SYSTEM_PROMPT = `You are the HERM Procurement Assistant, an expert in UK higher education IT systems procurement. You have deep knowledge of UCISA HERM v3.1, the 165 capability framework, and all major SIS/LMS/CRM vendors. You help universities evaluate and compare systems. Be specific, cite HERM capability codes (e.g. BC011, BC086), and give balanced vendor assessments. Never recommend a specific vendor — present evidence and let the user decide. Keep responses concise and structured.`;

export async function chat(sessionId: string, userMessage: string): Promise<string> {
  if (!client) {
    return "The AI Assistant requires an ANTHROPIC_API_KEY environment variable to function. Please add it to your .env file.\n\nIn the meantime, you can:\n- Browse the **Leaderboard** for ranked system comparisons\n- Use the **Radar Comparison** to compare up to 5 systems visually\n- Build a **Capability Basket** to score systems against your requirements\n- Check the **How It Works** guide for scoring methodology";
  }

  // Get conversation history
  const history = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  // Build context: top systems summary
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

  // Save user message
  await prisma.chatMessage.create({
    data: { sessionId, role: 'user', content: userMessage },
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT + '\n\n' + contextMessage,
    messages,
  });

  const assistantContent =
    response.content[0].type === 'text' ? response.content[0].text : '';

  // Save assistant message
  await prisma.chatMessage.create({
    data: { sessionId, role: 'assistant', content: assistantContent },
  });

  return assistantContent;
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
