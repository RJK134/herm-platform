import { Request, Response, NextFunction } from 'express';
import prisma from '../../utils/prisma';

const MIN_INSTITUTIONS = 5;

export const getOverview = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [institutions, evaluations, procurements] = await Promise.all([
      prisma.institution.count(),
      prisma.evaluationProject.count(),
      prisma.procurementProject.count(),
    ]);

    const topSystems = institutions >= MIN_INSTITUTIONS
      ? await prisma.vendorSystem.findMany({
          select: { id: true, name: true, vendor: true, _count: { select: { scores: true } } },
          orderBy: { scores: { _count: 'desc' } },
          take: 10,
        })
      : [];

    const topCapabilities = institutions >= MIN_INSTITUTIONS
      ? await prisma.basketItem.groupBy({
          by: ['capabilityId'],
          _count: { capabilityId: true },
          orderBy: { _count: { capabilityId: 'desc' } },
          take: 15,
        })
      : [];

    res.json({ success: true, data: { institutions, evaluations, procurements, topSystems, topCapabilities } });
  } catch (err) { next(err); }
};

export const getSystems = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const count = await prisma.institution.count();
    if (count < MIN_INSTITUTIONS) {
      res.json({ success: true, data: [], note: 'Insufficient data.' });
      return;
    }
    const data = await prisma.vendorSystem.findMany({
      select: { id: true, name: true, vendor: true, category: true, _count: { select: { scores: true } } },
      orderBy: { scores: { _count: 'desc' } },
      take: 20,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const getCapabilities = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const count = await prisma.institution.count();
    if (count < MIN_INSTITUTIONS) {
      res.json({ success: true, data: [], note: 'Insufficient data.' });
      return;
    }
    const caps = await prisma.basketItem.groupBy({
      by: ['capabilityId'],
      _count: { capabilityId: true },
      orderBy: { _count: { capabilityId: 'desc' } },
      take: 20,
    });
    const ids = caps.map(c => c.capabilityId);
    const capabilities = await prisma.hermCapability.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, name: true, family: { select: { name: true } } },
    });
    const capMap = new Map(capabilities.map(c => [c.id, c]));
    const enriched = caps.map(c => ({
      capabilityId: c.capabilityId,
      count: c._count.capabilityId,
      code: capMap.get(c.capabilityId)?.code ?? c.capabilityId,
      name: capMap.get(c.capabilityId)?.name ?? c.capabilityId,
      family: capMap.get(c.capabilityId)?.family?.name ?? '',
    }));
    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
};

export const getJurisdictions = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [jurisdictionDefs, projectGroups] = await Promise.all([
      prisma.procurementJurisdiction.findMany({
        where: { isActive: true },
        select: { code: true, name: true },
      }),
      prisma.procurementProject.groupBy({
        by: ['jurisdiction'],
        _count: { jurisdiction: true },
      }),
    ]);

    const countMap = new Map(projectGroups.map(g => [g.jurisdiction, g._count.jurisdiction]));

    const data = jurisdictionDefs
      .map(j => ({ code: j.code, name: j.name, count: countMap.get(j.code) ?? 0 }))
      .filter(r => r.count > 0);

    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const getTrends = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const [evals, procs, regs] = await Promise.all([
      prisma.evaluationProject.findMany({ where: { createdAt: { gte: twelveMonthsAgo } }, select: { createdAt: true } }),
      prisma.procurementProject.findMany({ where: { createdAt: { gte: twelveMonthsAgo } }, select: { createdAt: true } }),
      prisma.institution.findMany({ where: { createdAt: { gte: twelveMonthsAgo } }, select: { createdAt: true } }),
    ]);

    const groupByMonth = (items: { createdAt: Date }[]): Record<string, number> => {
      const counts: Record<string, number> = {};
      items.forEach(i => {
        const key = `${i.createdAt.getFullYear()}-${String(i.createdAt.getMonth() + 1).padStart(2, '0')}`;
        counts[key] = (counts[key] ?? 0) + 1;
      });
      return counts;
    };

    res.json({
      success: true,
      data: {
        evaluations: groupByMonth(evals),
        procurements: groupByMonth(procs),
        registrations: groupByMonth(regs),
      },
    });
  } catch (err) { next(err); }
};
