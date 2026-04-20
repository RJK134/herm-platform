import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { optionalJWT } from '../../middleware/auth';
import prisma from '../../utils/prisma';

const router = Router();
router.use(optionalJWT);

const MIN_INSTITUTIONS = 5;

router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
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

    // BasketItem groups by capabilityId (schema has capabilityId, not capabilityCode)
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
});

router.get('/systems', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await prisma.institution.count();
    if (count < MIN_INSTITUTIONS) {
      res.json({ success: true, data: [], note: 'Insufficient data.' });
      return;
    }
    const systems = await prisma.vendorSystem.findMany({
      select: { id: true, name: true, vendor: true, category: true, _count: { select: { scores: true } } },
      orderBy: { scores: { _count: 'desc' } },
      take: 20,
    });
    res.json({ success: true, data: systems });
  } catch (err) { next(err); }
});

router.get('/capabilities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await prisma.institution.count();
    if (count < MIN_INSTITUTIONS) {
      res.json({ success: true, data: [], note: 'Insufficient data.' });
      return;
    }
    // Group by capabilityId (BasketItem has capabilityId, not capabilityCode)
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
});

router.get('/jurisdictions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ProcurementJurisdiction has no direct FK from ProcurementProject.
    // ProcurementProject.jurisdiction is a plain String field (e.g. "UK", "EU").
    // We count projects per jurisdiction code string, then join with ProcurementJurisdiction names.
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

    const result = jurisdictionDefs.map(j => ({
      code: j.code,
      name: j.name,
      count: countMap.get(j.code) ?? 0,
    })).filter(r => r.count > 0);

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/trends', async (req: Request, res: Response, next: NextFunction) => {
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
});

export default router;
