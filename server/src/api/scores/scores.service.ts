import prisma from '../../utils/prisma';
import { getLicence } from '../../utils/licence';
import type { Framework } from '@prisma/client';

export class ScoresService {
  /**
   * Resolve which framework to use for leaderboard/heatmap queries.
   *
   * Priority:
   *   1. Explicit frameworkId (must exist AND be active). Callers that need
   *      tier enforcement should wrap this service with tier-gate middleware.
   *   2. Fallback — first public active framework.
   *
   * The previous `isDefault` fallback would silently surface the proprietary
   * FHE framework to anonymous callers. Defaulting to the public framework
   * is safe for every tier; paid callers pass frameworkId explicitly.
   */
  private async resolveFramework(frameworkId?: string): Promise<Framework | null> {
    if (frameworkId) {
      const framework = await prisma.framework.findUnique({ where: { id: frameworkId } });
      if (framework && framework.isActive) return framework;
    }

    // Fall back to first public active framework (safe for all tiers).
    return prisma.framework.findFirst({
      where: { isPublic: true, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getLeaderboard(frameworkId?: string) {
    const framework = await this.resolveFramework(frameworkId);
    if (!framework) {
      return { entries: [], licence: null, framework: null };
    }

    const systems = await prisma.vendorSystem.findMany({
      orderBy: { name: 'asc' },
    });

    const domains = await prisma.frameworkDomain.findMany({
      where: { frameworkId: framework.id },
      include: { capabilities: true },
      orderBy: { sortOrder: 'asc' },
    });

    const allScores = await prisma.capabilityScore.findMany({
      where: { frameworkId: framework.id, version: 1 },
      include: {
        capability: { include: { domain: true } },
      },
    });

    // Group scores by systemId
    const scoresBySystem: Record<string, Array<typeof allScores[0]>> = {};
    for (const score of allScores) {
      if (!scoresBySystem[score.systemId]) scoresBySystem[score.systemId] = [];
      scoresBySystem[score.systemId].push(score);
    }

    const entries = systems.map((system) => {
      const scores = scoresBySystem[system.id] || [];

      const domainScores = domains.map((domain) => {
        const domainCaps = domain.capabilities.map((c) => c.id);
        const domainScoreList = scores.filter((s) => domainCaps.includes(s.capabilityId));
        const total = domainScoreList.reduce((sum, s) => sum + s.value, 0);
        const max = domain.capabilities.length * 100;
        return {
          domainCode: domain.code,
          domainName: domain.name,
          score: total,
          maxScore: max,
          percentage: max > 0 ? (total / max) * 100 : 0,
        };
      });

      const totalScore = scores.reduce((sum, s) => sum + s.value, 0);
      const maxScore = domains.reduce((sum, d) => sum + d.capabilities.length * 100, 0);

      return {
        system,
        totalScore,
        maxScore,
        percentage: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
        rank: 0,
        domainScores,
      };
    });

    // Sort by percentage desc and assign ranks
    entries.sort((a, b) => b.percentage - a.percentage);
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    const licence = getLicence(framework);

    return {
      entries,
      licence,
      framework: {
        id: framework.id,
        slug: framework.slug,
        name: framework.name,
        version: framework.version,
        domainCount: framework.domainCount,
        capabilityCount: framework.capabilityCount,
      },
    };
  }

  async getHeatmap(frameworkId?: string) {
    const framework = await this.resolveFramework(frameworkId);

    const systems = await prisma.vendorSystem.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const capabilities = framework
      ? await prisma.capability.findMany({
          where: { frameworkId: framework.id },
          include: { domain: true },
          orderBy: { sortOrder: 'asc' },
        })
      : [];

    const scores = framework
      ? await prisma.capabilityScore.findMany({
          where: { frameworkId: framework.id, version: 1 },
        })
      : [];

    // Pre-build O(1) capability id→code lookup
    const capIdToCode = new Map<string, string>();
    for (const cap of capabilities) {
      capIdToCode.set(cap.id, cap.code);
    }

    // Build matrix: systemId -> capabilityCode -> value
    const matrix: Record<string, Record<string, number>> = {};
    for (const system of systems) {
      matrix[system.id] = {};
    }
    for (const score of scores) {
      const capCode = capIdToCode.get(score.capabilityId);
      if (capCode && matrix[score.systemId]) {
        matrix[score.systemId][capCode] = score.value;
      }
    }

    const licence = framework ? getLicence(framework) : null;

    return {
      systems,
      capabilities,
      matrix,
      licence,
      framework: framework
        ? {
            id: framework.id,
            slug: framework.slug,
            name: framework.name,
            version: framework.version,
            domainCount: framework.domainCount,
            capabilityCount: framework.capabilityCount,
          }
        : null,
    };
  }
}
