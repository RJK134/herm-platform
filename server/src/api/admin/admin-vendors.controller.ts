import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../../utils/prisma';
import type { VendorTier } from '@prisma/client';

const updateVendorAccountSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'suspended']).optional(),
  systemId: z.string().cuid().optional(),
  tier: z.enum(['BASIC', 'ENHANCED', 'PREMIUM']).optional(),
});

const reviewSubmissionSchema = z.object({
  status: z.enum(['approved', 'rejected', 'pending']),
  reviewNotes: z.string().max(2000).optional(),
});

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
    const parsed = updateVendorAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid request body' } });
      return;
    }
    const { status, systemId, tier } = parsed.data;
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
    const parsed = reviewSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid request body' } });
      return;
    }
    const { status, reviewNotes } = parsed.data;
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
