import type { CreateAssessmentInput, CurrentSystem } from './integration.schema';
import prisma from '../../utils/prisma';

interface IntegrationFindings {
  risks: string[];
  opportunities: string[];
  recommendations: string[];
}

function computeComplexityScore(
  currentSystems: CurrentSystem[],
  targetApiStandards: string[],
  targetIsCloudNative: boolean
): number {
  let score = 20; // Base complexity

  // Each current system adds 5 points
  score += currentSystems.length * 5;

  // Systems with weak/no API support add extra complexity
  for (const sys of currentSystems) {
    if (sys.apiSupport === 'Proprietary API' || sys.apiSupport === 'None') {
      score += 10;
    }
  }

  // If no current system shares a protocol with the target: +15
  const currentProtocols = currentSystems.map((s) => s.apiSupport.toLowerCase());
  const targetProtocols = targetApiStandards.map((p) => p.toLowerCase());
  const hasOverlap = currentProtocols.some((p) =>
    targetProtocols.some((tp) => tp.includes(p) || p.includes(tp))
  );
  if (!hasOverlap && targetProtocols.length > 0) {
    score += 15;
  }

  // If target is cloud-native but most current systems use on-prem patterns
  const onPremLike = currentSystems.filter(
    (s) => s.apiSupport === 'None' || s.apiSupport === 'SOAP' || s.apiSupport === 'Proprietary API'
  );
  if (targetIsCloudNative && onPremLike.length > currentSystems.length / 2) {
    score += 10;
  }

  return Math.min(score, 100);
}

function deriveRiskLevel(score: number): string {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

function generateFindings(
  currentSystems: CurrentSystem[],
  targetName: string,
  targetApiStandards: string[],
  complexityScore: number
): IntegrationFindings {
  const risks: string[] = [];
  const opportunities: string[] = [];
  const recommendations: string[] = [];

  // Risks from individual systems
  for (const sys of currentSystems) {
    if (sys.apiSupport === 'None') {
      risks.push(
        `${sys.name} (${sys.category}) has no API — will require file-based or custom integration`
      );
      recommendations.push(
        `Consider middleware (e.g. MuleSoft, Azure Integration Services) for ${sys.name} integration`
      );
    } else if (sys.apiSupport === 'SOAP') {
      risks.push(
        `Legacy SOAP integration required for ${sys.name} — additional transformation layer needed`
      );
      recommendations.push(
        `Use an API gateway to transform SOAP responses from ${sys.name} to REST/JSON`
      );
    } else if (sys.apiSupport === 'Proprietary API') {
      risks.push(
        `${sys.name} uses a proprietary API — vendor lock-in risk and potential additional licence cost`
      );
      recommendations.push(
        `Request vendor roadmap for open API/standards adoption from ${sys.name}`
      );
    }
  }

  // General risk from score
  if (complexityScore >= 70) {
    risks.push(
      'High overall integration complexity — consider phased rollout to manage risk'
    );
    risks.push(
      'Recommend dedicated integration architect resource for the duration of the programme'
    );
  }

  // Opportunities
  const restSystems = currentSystems.filter((s) => s.apiSupport === 'REST' || s.apiSupport === 'GraphQL');
  if (restSystems.length > 0) {
    opportunities.push(
      `${restSystems.length} existing system(s) already use REST/GraphQL — aligns well with modern integration patterns`
    );
  }

  if (targetApiStandards.length > 0) {
    opportunities.push(
      `${targetName} supports ${targetApiStandards.join(', ')} — enables event-driven integration architectures`
    );
  }

  if (complexityScore < 40) {
    opportunities.push(
      'Low integration complexity — good candidate for a streamlined implementation timeline'
    );
  }

  // General recommendations
  recommendations.push(
    `Conduct a full data mapping exercise between ${targetName} and all existing systems before go-live`
  );
  recommendations.push(
    'Implement an integration test environment mirroring production to validate all data flows'
  );

  if (currentSystems.length >= 5) {
    recommendations.push(
      'With 5+ existing systems, consider an iPaaS (Integration Platform as a Service) to centralise integration management'
    );
  }

  return { risks, opportunities, recommendations };
}

export class IntegrationService {
  async createAssessment(data: CreateAssessmentInput) {
    let targetApiStandards: string[] = [];
    let targetIsCloudNative = false;
    let targetName = 'target system';

    if (data.targetSystemId) {
      const target = await prisma.vendorSystem.findUnique({
        where: { id: data.targetSystemId },
        include: { profile: true },
      });
      if (target) {
        targetName = target.name;
        targetIsCloudNative = target.cloudNative;
        targetApiStandards = target.profile?.apiStandards ?? [];
      }
    }

    const currentSystems = data.currentSystems as CurrentSystem[];
    const complexityScore = computeComplexityScore(
      currentSystems,
      targetApiStandards,
      targetIsCloudNative
    );
    const riskLevel = deriveRiskLevel(complexityScore);
    const findings = generateFindings(
      currentSystems,
      targetName,
      targetApiStandards,
      complexityScore
    );

    // Cast findings to satisfy Prisma's InputJsonValue requirement
    const findingsJson = findings as unknown as import('@prisma/client').Prisma.InputJsonValue;

    return prisma.integrationAssessment.create({
      data: {
        name: data.name,
        currentSystems: data.currentSystems as unknown as import('@prisma/client').Prisma.InputJsonValue,
        targetSystemId: data.targetSystemId ?? null,
        complexityScore,
        riskLevel,
        findings: findingsJson,
        createdById: data.createdById ?? 'anonymous',
      },
      include: {
        targetSystem: { select: { id: true, name: true, vendor: true, cloudNative: true } },
      },
    });
  }

  async listAssessments() {
    return prisma.integrationAssessment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        targetSystem: { select: { id: true, name: true, vendor: true } },
      },
    });
  }

  async getAssessment(id: string) {
    return prisma.integrationAssessment.findUnique({
      where: { id },
      include: {
        targetSystem: { select: { id: true, name: true, vendor: true, cloudNative: true } },
      },
    });
  }
}
