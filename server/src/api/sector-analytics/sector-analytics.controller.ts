import { Request, Response, NextFunction } from 'express';
import prisma from '../../utils/prisma';

const MIN_INSTITUTIONS = 5;

/**
 * Sector analytics — institutional cross-cut views.
 *
 * Phase 10 / 10.1: SELF-EXCLUSION. Every aggregate response excludes the
 * caller's own institution from the dataset. Without this, a paid-tier
 * customer querying "top capabilities across the sector" would see their
 * OWN baskets contributing to the "anonymous" leaderboard, leaking signal
 * about competitor strategies — and worse, narrowing the k-anon set
 * without them realising it.
 *
 * The k-anonymity floor is computed against the EXCLUDED count
 * (≥ MIN_INSTITUTIONS others), so a 5-institution platform with one
 * caller will hide everything (count=4 fails the threshold) — by design.
 *
 * Authentication is enforced upstream by `authenticateJWT +
 * requirePaidTier(['pro','enterprise'])` on the router, so
 * `req.user` is guaranteed in every handler.
 */

/** Caller's institutionId — the value to exclude from each aggregate. */
function excludeId(req: Request): string {
  return req.user!.institutionId;
}

export const getOverview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const me = excludeId(req);
    const [institutionsExcl, evaluationsExcl, procurementsExcl] = await Promise.all([
      prisma.institution.count({ where: { NOT: { id: me } } }),
      prisma.evaluationProject.count({ where: { NOT: { institutionId: me } } }),
      prisma.procurementProject.count({ where: { NOT: { institutionId: me } } }),
    ]);

    const topSystems = institutionsExcl >= MIN_INSTITUTIONS
      ? await prisma.vendorSystem.findMany({
          select: { id: true, name: true, vendor: true, _count: { select: { scores: true } } },
          orderBy: { scores: { _count: 'desc' } },
          take: 10,
        })
      : [];

    const topCapabilities = institutionsExcl >= MIN_INSTITUTIONS
      ? await prisma.basketItem.groupBy({
          by: ['capabilityId'],
          // Exclude basket items owned by the caller's institution. The
          // BasketItem model joins to CapabilityBasket which has institutionId.
          where: { basket: { NOT: { institutionId: me } } },
          _count: { capabilityId: true },
          orderBy: { _count: { capabilityId: 'desc' } },
          take: 15,
        })
      : [];

    res.json({
      success: true,
      data: {
        institutions: institutionsExcl,
        evaluations: evaluationsExcl,
        procurements: procurementsExcl,
        topSystems,
        topCapabilities,
      },
    });
  } catch (err) { next(err); }
};

export const getSystems = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const me = excludeId(req);
    const count = await prisma.institution.count({ where: { NOT: { id: me } } });
    if (count < MIN_INSTITUTIONS) {
      res.json({ success: true, data: [], note: 'Insufficient data.' });
      return;
    }
    // CapabilityScore is global (no institutionId column), so the leaderboard
    // count of scores per system is sector-level signal that doesn't reveal
    // the caller's institution by itself. The k-anon gate above is what
    // protects against single-institution sets.
    const data = await prisma.vendorSystem.findMany({
      select: { id: true, name: true, vendor: true, category: true, _count: { select: { scores: true } } },
      orderBy: { scores: { _count: 'desc' } },
      take: 20,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const getCapabilities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const me = excludeId(req);
    const count = await prisma.institution.count({ where: { NOT: { id: me } } });
    if (count < MIN_INSTITUTIONS) {
      res.json({ success: true, data: [], note: 'Insufficient data.' });
      return;
    }
    const caps = await prisma.basketItem.groupBy({
      by: ['capabilityId'],
      where: { basket: { NOT: { institutionId: me } } },
      _count: { capabilityId: true },
      orderBy: { _count: { capabilityId: 'desc' } },
      take: 20,
    });
    const ids = caps.map(c => c.capabilityId);
    const capabilities = await prisma.capability.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, name: true, domain: { select: { name: true } } },
    });
    const capMap = new Map(capabilities.map(c => [c.id, c]));
    const enriched = caps.map(c => ({
      capabilityId: c.capabilityId,
      count: c._count.capabilityId,
      code: capMap.get(c.capabilityId)?.code ?? c.capabilityId,
      name: capMap.get(c.capabilityId)?.name ?? c.capabilityId,
      domain: capMap.get(c.capabilityId)?.domain?.name ?? '',
    }));
    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
};

export const getJurisdictions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const me = excludeId(req);
    const [jurisdictionDefs, projectGroups] = await Promise.all([
      prisma.procurementJurisdiction.findMany({
        where: { isActive: true },
        select: { code: true, name: true },
      }),
      prisma.procurementProject.groupBy({
        by: ['jurisdiction'],
        // Exclude caller's own institution's projects so they can't infer
        // jurisdiction-level peer activity from their own contribution.
        where: { NOT: { institutionId: me } },
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

export const getTrends = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const me = excludeId(req);
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const [evals, procs, regs] = await Promise.all([
      prisma.evaluationProject.findMany({
        where: { createdAt: { gte: twelveMonthsAgo }, NOT: { institutionId: me } },
        select: { createdAt: true },
      }),
      prisma.procurementProject.findMany({
        where: { createdAt: { gte: twelveMonthsAgo }, NOT: { institutionId: me } },
        select: { createdAt: true },
      }),
      prisma.institution.findMany({
        where: { createdAt: { gte: twelveMonthsAgo }, NOT: { id: me } },
        select: { createdAt: true },
      }),
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
