import { Request, Response, NextFunction } from 'express';
import * as stripeService from '../../services/stripe';
import prisma from '../../utils/prisma';

export const createCheckout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { tier } = req.body as { tier: string };
    const institutionId = req.user?.institutionId;
    const email = req.user?.email ?? '';
    const result = await stripeService.createCheckoutSession({
      tier: tier as Parameters<typeof stripeService.createCheckoutSession>[0]['tier'],
      email,
      institutionId,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const stripeWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    const result = await stripeService.handleWebhook(req.body as Buffer, sig);
    res.json({ received: true, handled: result.handled });
  } catch (err) { next(err); }
};

export const getStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const institutionId = req.user?.institutionId;
    if (!institutionId) {
      res.json({ success: true, data: { tier: 'FREE', status: 'inactive' } });
      return;
    }
    const sub = await prisma.subscription.findUnique({
      where: { institutionId },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
    res.json({ success: true, data: sub ?? { tier: 'FREE', status: 'inactive', payments: [] } });
  } catch (err) { next(err); }
};

export const cancelSub = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const institutionId = req.user?.institutionId;
    if (!institutionId) {
      res.status(401).json({ success: false, error: { code: 'AUTHENTICATION_ERROR', message: 'Auth required' } });
      return;
    }
    const sub = await prisma.subscription.findUnique({ where: { institutionId } });
    if (sub?.stripeSubscriptionId) {
      await stripeService.cancelSubscription(sub.stripeSubscriptionId);
    }
    await prisma.subscription.update({ where: { institutionId }, data: { status: 'cancelled', tier: 'FREE' } });
    res.json({ success: true, data: { cancelled: true } });
  } catch (err) { next(err); }
};

export const getInvoices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const institutionId = req.user?.institutionId;
    if (!institutionId) {
      res.json({ success: true, data: [] });
      return;
    }
    const sub = await prisma.subscription.findUnique({
      where: { institutionId },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });
    res.json({ success: true, data: sub?.payments ?? [] });
  } catch (err) { next(err); }
};
