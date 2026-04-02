import prisma from '../../utils/prisma';

export class ScoresService {
  async getLeaderboard() {
    const systems = await prisma.vendorSystem.findMany({
      orderBy: { name: 'asc' },
    });

    const families = await prisma.hermFamily.findMany({
      include: { capabilities: true },
      orderBy: { sortOrder: 'asc' },
    });

    const allScores = await prisma.score.findMany({
      where: { version: 1 },
      include: {
        capability: { include: { family: true } },
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

      const familyScores = families.map((family) => {
        const familyCaps = family.capabilities.map(c => c.id);
        const familyScoreList = scores.filter(s => familyCaps.includes(s.capabilityId));
        const total = familyScoreList.reduce((sum, s) => sum + s.value, 0);
        const max = family.capabilities.length * 100;
        return {
          familyCode: family.code,
          familyName: family.name,
          score: total,
          maxScore: max,
          percentage: max > 0 ? (total / max) * 100 : 0,
        };
      });

      const totalScore = scores.reduce((sum, s) => sum + s.value, 0);
      const maxScore = families.reduce((sum, f) => sum + f.capabilities.length * 100, 0);

      return {
        system,
        totalScore,
        maxScore,
        percentage: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
        rank: 0,
        familyScores,
      };
    });

    // Sort by percentage desc and assign ranks
    entries.sort((a, b) => b.percentage - a.percentage);
    entries.forEach((e, i) => { e.rank = i + 1; });

    return entries;
  }

  async getHeatmap() {
    const systems = await prisma.vendorSystem.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const capabilities = await prisma.hermCapability.findMany({
      include: { family: true },
      orderBy: { sortOrder: 'asc' },
    });

    const scores = await prisma.score.findMany({
      where: { version: 1 },
    });

    // Build matrix: systemId -> capabilityCode -> value
    const matrix: Record<string, Record<string, number>> = {};
    for (const system of systems) {
      matrix[system.id] = {};
    }
    for (const score of scores) {
      const cap = capabilities.find(c => c.id === score.capabilityId);
      if (cap && matrix[score.systemId]) {
        matrix[score.systemId][cap.code] = score.value;
      }
    }

    return { systems, capabilities, matrix };
  }
}
