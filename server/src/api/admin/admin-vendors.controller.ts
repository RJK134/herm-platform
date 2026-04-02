import { Request, Response, NextFunction } from 'express';
import prisma from '../../utils/prisma';
import type { VendorTier } from '@prisma/client';

export const listVendorAccounts = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await prisma.vendorAccount.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        system: { select: { id: true, name: true, vendor: true } },
        _count: { select: { submissions: true, users: true } },
      },
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const updateVendorAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, systemId, tier } = req.body as Record<string, string>;
    const data = await prisma.vendorAccount.update({
      where: { id: req.params['id'] as string },
      data: {
        status: status ?? undefined,
        systemId: systemId ?? undefined,
        tier: tier ? (tier as VendorTier) : undefined,
        approvedAt: status === 'approved' ? new Date() : undefined,
        approvedBy: status === 'approved' ? (req.user?.userId ?? 'admin') : undefined,
      },
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const getVendorSubmissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await prisma.vendorSubmission.findMany({
      where: { vendorAccountId: req.params['id'] as string },
      orderBy: { submittedAt: 'desc' },
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const reviewSubmission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, reviewNotes } = req.body as { status: string; reviewNotes?: string };
    const data = await prisma.vendorSubmission.update({
      where: { id: req.params['id'] as string },
      data: {
        status,
        reviewNotes,
        reviewedBy: req.user?.userId ?? 'admin',
        reviewedAt: new Date(),
      },
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};
