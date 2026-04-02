import prisma from '../../utils/prisma';
import { NotFoundError } from '../../utils/errors';

export class SystemsService {
  async listSystems(params: { category?: string }) {
    const where = params.category ? { category: params.category } : {};
    return prisma.vendorSystem.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async getSystemById(id: string) {
    const system = await prisma.vendorSystem.findUnique({
      where: { id },
      include: {
        scores: {
          include: {
            capability: {
              include: { family: true },
            },
          },
        },
      },
    });
    if (!system) throw new NotFoundError(`System not found: ${id}`);
    return system;
  }

  async getSystemScores(id: string) {
    const system = await prisma.vendorSystem.findUnique({ where: { id } });
    if (!system) throw new NotFoundError(`System not found: ${id}`);

    const scores = await prisma.score.findMany({
      where: { systemId: id, version: 1 },
      include: {
        capability: { include: { family: true } },
      },
    });

    // Return as map of code -> value and full grouped structure
    const byCode: Record<string, number> = {};
    const byFamily: Record<string, { familyCode: string; familyName: string; capabilities: Array<{ code: string; name: string; value: number }> }> = {};

    for (const s of scores) {
      byCode[s.capability.code] = s.value;
      const fCode = s.capability.family.code;
      if (!byFamily[fCode]) {
        byFamily[fCode] = {
          familyCode: fCode,
          familyName: s.capability.family.name,
          capabilities: [],
        };
      }
      byFamily[fCode].capabilities.push({
        code: s.capability.code,
        name: s.capability.name,
        value: s.value,
      });
    }

    return { system, byCode, byFamily: Object.values(byFamily) };
  }

  async compareSystems(ids: string[]) {
    const systems = await prisma.vendorSystem.findMany({
      where: { id: { in: ids } },
    });

    const families = await prisma.hermFamily.findMany({
      include: { capabilities: true },
      orderBy: { sortOrder: 'asc' },
    });

    const results = await Promise.all(
      systems.map(async (system) => {
        const scores = await prisma.score.findMany({
          where: { systemId: system.id, version: 1 },
          include: { capability: { include: { family: true } } },
        });

        const scoreMap: Record<string, number> = {};
        for (const s of scores) {
          scoreMap[s.capability.code] = s.value;
        }

        const familyScores = families.map((family) => {
          const caps = family.capabilities;
          const total = caps.reduce((sum, c) => sum + (scoreMap[c.code] ?? 0), 0);
          const max = caps.length * 100;
          return {
            familyCode: family.code,
            familyName: family.name,
            score: total,
            maxScore: max,
            percentage: max > 0 ? (total / max) * 100 : 0,
          };
        });

        const totalScore = familyScores.reduce((s, f) => s + f.score, 0);
        const maxScore = familyScores.reduce((s, f) => s + f.maxScore, 0);

        return {
          system,
          totalScore,
          maxScore,
          percentage: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
          rank: 0,
          familyScores,
        };
      })
    );

    // Sort by percentage desc and assign ranks
    results.sort((a, b) => b.percentage - a.percentage);
    results.forEach((r, i) => { r.rank = i + 1; });

    return results;
  }
}
