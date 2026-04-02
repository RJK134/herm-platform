import prisma from '../../utils/prisma';
import { NotFoundError } from '../../utils/errors';
import type { CreateArchitectureAssessmentInput, SystemNode, IntegrationLink } from './architecture.schema';

// ── Architecture pattern maturity scores (0–100) ─────────────────────────────
const PATTERN_MATURITY: Record<string, number> = {
  'point-to-point': 15,
  'file-transfer': 20,
  'shared-database': 25,
  'messaging': 55,
  'esb': 60,
  'api-gateway': 70,
  'ipaas': 78,
  'event-driven': 85,
};

interface RecommendationItem {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'positive';
  category: string;
  text: string;
  action: string;
}

function analyseArchitecture(
  systems: SystemNode[],
  links: IntegrationLink[],
  pattern: string,
  dataRisk: number,
  cutoverRisk: number,
  integrationRisk: number,
  changeRisk: number
): { overallRisk: number; readinessScore: number; recommendations: RecommendationItem[] } {
  // Weighted risk score
  const overallRisk = Math.round(
    dataRisk * 0.30 +
    cutoverRisk * 0.25 +
    integrationRisk * 0.30 +
    changeRisk * 0.15
  );

  const patternMaturity = PATTERN_MATURITY[pattern] ?? 25;
  const numSystems = systems.length;
  const numLinks = links.length;

  // Integration density penalty (too many P2P connections = complexity)
  const maxPossibleLinks = numSystems > 1 ? (numSystems * (numSystems - 1)) / 2 : 1;
  const linkDensity = numLinks / maxPossibleLinks;
  const densityPenalty = pattern === 'point-to-point' ? Math.round(linkDensity * 20) : 0;

  // Average system age penalty
  const avgAge = systems.length > 0
    ? systems.reduce((sum, s) => sum + s.ageYears, 0) / systems.length
    : 0;
  const agePenalty = avgAge > 10 ? Math.min(15, Math.round((avgAge - 10) * 1.5)) : 0;

  // Readiness = inverse risk adjusted for pattern maturity
  const readinessScore = Math.max(
    5,
    Math.min(
      95,
      Math.round(
        (100 - overallRisk) * 0.55 +
        patternMaturity * 0.30 +
        (100 - densityPenalty) * 0.10 +
        (100 - agePenalty) * 0.05
      )
    )
  );

  const recommendations: RecommendationItem[] = [];

  // Pattern recommendations
  if (pattern === 'point-to-point' && numSystems > 8) {
    recommendations.push({
      severity: 'critical',
      category: 'Architecture Pattern',
      text: `With ${numSystems} systems using point-to-point integration, you have significant technical debt and hidden interdependencies.`,
      action: 'Adopt an API Gateway or iPaaS platform before implementing a new SIS to avoid compounding integration complexity.',
    });
  } else if (pattern === 'point-to-point' && numSystems > 4) {
    recommendations.push({
      severity: 'high',
      category: 'Architecture Pattern',
      text: `Point-to-point integration with ${numSystems} systems creates brittle, hard-to-maintain connections.`,
      action: 'Evaluate API Gateway tools (e.g. MuleSoft, Azure API Management) as part of the overall programme.',
    });
  } else if (pattern === 'api-gateway' || pattern === 'ipaas' || pattern === 'event-driven') {
    recommendations.push({
      severity: 'positive',
      category: 'Architecture Pattern',
      text: 'Your current architecture pattern supports modern integration well.',
      action: 'Ensure the new system vendor provides published APIs conforming to your gateway standards.',
    });
  }

  // Data risk recommendations
  if (dataRisk >= 75) {
    recommendations.push({
      severity: 'critical',
      category: 'Data Migration',
      text: 'High data migration risk — complex or poor-quality data will significantly delay implementation.',
      action: 'Commission a data quality assessment immediately. Engage a specialist data migration partner. Plan for 2-3 data migration rehearsals.',
    });
  } else if (dataRisk >= 50) {
    recommendations.push({
      severity: 'high',
      category: 'Data Migration',
      text: 'Moderate-to-high data migration complexity identified.',
      action: 'Allocate dedicated resource for data cleansing pre-migration. Include data migration rehearsals in the project plan.',
    });
  }

  // Cutover risk recommendations
  if (cutoverRisk >= 70) {
    recommendations.push({
      severity: 'high',
      category: 'Go-Live Strategy',
      text: 'High cutover risk — a "big bang" go-live carries significant operational exposure.',
      action: 'Plan a phased rollout by academic year / faculty. Maintain parallel running for one semester minimum.',
    });
  }

  // Integration risk
  if (integrationRisk >= 70) {
    recommendations.push({
      severity: 'high',
      category: 'Technical Integration',
      text: 'High integration complexity will extend the implementation timeline.',
      action: 'Conduct a technical integration workshop with shortlisted vendors. Require API documentation as part of the ITT response.',
    });
  }

  // Change management
  if (changeRisk >= 70) {
    recommendations.push({
      severity: 'high',
      category: 'Change Management',
      text: 'Significant organisational change risk — staff adoption is a common failure mode in HE SIS implementations.',
      action: 'Appoint a dedicated Change Manager. Plan for 6+ months of training and communication. Involve end users in UAT from month 1.',
    });
  }

  // Legacy system age
  if (avgAge > 12) {
    recommendations.push({
      severity: 'medium',
      category: 'Legacy Systems',
      text: `Average system age of ${Math.round(avgAge)} years suggests significant technical debt in your current estate.`,
      action: 'Consider a wider digital transformation programme alongside the SIS replacement.',
    });
  }

  // Proprietary protocols
  const proprietaryLinks = links.filter((l) => l.protocol === 'Proprietary' || l.protocol === 'None');
  if (proprietaryLinks.length >= 3) {
    recommendations.push({
      severity: 'medium',
      category: 'API Standards',
      text: `${proprietaryLinks.length} integration links use proprietary or undocumented protocols.`,
      action: 'Include open API standards (REST/JSON, OpenAPI 3.0) as a mandatory requirement in the ITT.',
    });
  }

  // Positive: cloud-native systems
  const cloudSystems = systems.filter((s) => s.cloudNative);
  if (cloudSystems.length >= systems.length * 0.6 && systems.length > 0) {
    recommendations.push({
      severity: 'positive',
      category: 'Cloud Readiness',
      text: `${cloudSystems.length} of your ${systems.length} systems are cloud-native — good alignment with modern SIS platforms.`,
      action: 'Prioritise cloud-native SIS options to maximise integration compatibility.',
    });
  }

  return { overallRisk, readinessScore, recommendations };
}

export class ArchitectureService {
  async createAssessment(data: CreateArchitectureAssessmentInput) {
    const { overallRisk, readinessScore, recommendations } = analyseArchitecture(
      data.currentSystems,
      data.integrationLinks,
      data.architecturePattern,
      data.dataRisk,
      data.cutoverRisk,
      data.integrationRisk,
      data.changeRisk
    );

    return prisma.architectureAssessment.create({
      data: {
        name: data.name,
        institutionId: data.institutionId ?? null,
        targetSystemId: data.targetSystemId ?? null,
        currentSystems: data.currentSystems,
        integrationLinks: data.integrationLinks,
        architecturePattern: data.architecturePattern,
        dataRisk: data.dataRisk,
        cutoverRisk: data.cutoverRisk,
        integrationRisk: data.integrationRisk,
        changeRisk: data.changeRisk,
        overallRisk,
        readinessScore,
        recommendations: recommendations as unknown as import('@prisma/client').Prisma.InputJsonValue,
        notes: data.notes ?? null,
        createdById: data.institutionId ?? 'anonymous',
      },
      include: { targetSystem: { select: { id: true, name: true, vendor: true } } },
    });
  }

  async listAssessments() {
    return prisma.architectureAssessment.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        architecturePattern: true,
        overallRisk: true,
        readinessScore: true,
        createdAt: true,
        targetSystem: { select: { id: true, name: true, vendor: true } },
      },
    });
  }

  async getAssessment(id: string) {
    const item = await prisma.architectureAssessment.findUnique({
      where: { id },
      include: { targetSystem: { select: { id: true, name: true, vendor: true, category: true } } },
    });
    if (!item) throw new NotFoundError(`Architecture assessment not found: ${id}`);
    return item;
  }

  async deleteAssessment(id: string) {
    return prisma.architectureAssessment.delete({ where: { id } });
  }

  /** Stateless analysis — does not persist, used for real-time preview */
  analyse(data: CreateArchitectureAssessmentInput) {
    return analyseArchitecture(
      data.currentSystems,
      data.integrationLinks,
      data.architecturePattern,
      data.dataRisk,
      data.cutoverRisk,
      data.integrationRisk,
      data.changeRisk
    );
  }
}
