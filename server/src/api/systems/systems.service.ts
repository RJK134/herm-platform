import prisma from '../../utils/prisma';
import { NotFoundError } from '../../utils/errors';

export class SystemsService {
  async listSystems(params: { category?: string; limit?: number; offset?: number }) {
    const where = params.category ? { category: params.category } : {};
    return prisma.vendorSystem.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      take: Math.min(params.limit ?? 200, 200),
      skip: params.offset ?? 0,
    });
  }

  async getSystemById(id: string) {
    const system = await prisma.vendorSystem.findUnique({
      where: { id },
      include: {
        scores: {
          include: {
            capability: {
              include: { domain: true },
            },
          },
        },
      },
    });
    if (!system) throw new NotFoundError(`System not found: ${id}`);
    return system;
  }

  async getSystemScores(id: string, frameworkId?: string) {
    const system = await prisma.vendorSystem.findUnique({ where: { id } });
    if (!system) throw new NotFoundError(`System not found: ${id}`);

    // Scope to the caller's active framework so HERM and FHE scores do not
    // mix into the same byDomain aggregation.
    const scores = await prisma.capabilityScore.findMany({
      where: {
        systemId: id,
        version: 1,
        ...(frameworkId ? { frameworkId } : {}),
      },
      include: {
        capability: { include: { domain: true } },
      },
    });

    // Scores are stored 0-100 per capability. A domain's `maxScore` is
    // `capabilities.length * 100`; `score` is the sum of capability values.
    const byCode: Record<string, number> = {};
    const byDomain: Record<
      string,
      {
        domainCode: string;
        domainName: string;
        score: number;
        maxScore: number;
        capabilities: Array<{ code: string; name: string; value: number }>;
      }
    > = {};

    for (const s of scores) {
      byCode[s.capability.code] = s.value;
      const domainCode = s.capability.domain.code;
      const domain =
        byDomain[domainCode] ??
        (byDomain[domainCode] = {
          domainCode,
          domainName: s.capability.domain.name,
          score: 0,
          maxScore: 0,
          capabilities: [],
        });
      domain.capabilities.push({
        code: s.capability.code,
        name: s.capability.name,
        value: s.value,
      });
      domain.score += s.value;
      domain.maxScore += 100; // CapabilityScore.value is 0/50/100 per capability (consistent with vendor-portal.service.ts and scores.service.ts)
    }

    return { system, byCode, byDomain: Object.values(byDomain) };
  }

  async compareSystems(ids: string[], frameworkId?: string) {
    const systems = await prisma.vendorSystem.findMany({
      where: { id: { in: ids } },
    });

    // Scope domains + scores to the active framework — comparison across
    // frameworks makes no sense and would produce mixed aggregations.
    const domains = await prisma.frameworkDomain.findMany({
      where: frameworkId ? { frameworkId } : undefined,
      include: { capabilities: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Batch-load all scores for all requested systems in a single query (avoids N+1)
    const allScores = await prisma.capabilityScore.findMany({
      where: {
        systemId: { in: ids },
        version: 1,
        ...(frameworkId ? { frameworkId } : {}),
      },
      include: { capability: true },
    });

    // Build map: systemId -> capabilityCode -> value
    const scoreIndex = new Map<string, Map<string, number>>();
    for (const s of allScores) {
      if (!scoreIndex.has(s.systemId)) scoreIndex.set(s.systemId, new Map());
      scoreIndex.get(s.systemId)!.set(s.capability.code, s.value);
    }

    const results = systems.map((system) => {
      const scoreMap = scoreIndex.get(system.id) ?? new Map<string, number>();

      const domainScores = domains.map((domain) => {
        const caps = domain.capabilities;
        const total = caps.reduce((sum, c) => sum + (scoreMap.get(c.code) ?? 0), 0);
        const max = caps.length * 100;
        return {
          domainCode: domain.code,
          domainName: domain.name,
          score: total,
          maxScore: max,
          percentage: max > 0 ? (total / max) * 100 : 0,
        };
      });

      const totalScore = domainScores.reduce((s, f) => s + f.score, 0);
      const maxScore = domainScores.reduce((s, f) => s + f.maxScore, 0);

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
    results.sort((a, b) => b.percentage - a.percentage);
    results.forEach((r, i) => { r.rank = i + 1; });

    return results;
  }
}
