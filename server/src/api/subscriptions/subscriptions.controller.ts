import type { Request, Response, NextFunction } from 'express';
import * as stripeService from '../../services/stripe';
import prisma from '../../utils/prisma';

export const createCheckout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { tier } = req.body as { tier: string };
    // Router-level authenticateJWT guarantees req.user is present.
    const { institutionId, email } = req.user!;
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
  } catch (err) {
    // Signature-verification failures must surface as a non-200 so Stripe
    // retries the event with backoff. Previously this was swallowed (the
    // service returned `{ handled: false }` and the controller responded
    // 200), so a bad rotation or misconfigured webhook secret would lose
    // every event without a peep. Map the sentinel to 400 (Stripe's docs
    // say any 4xx triggers retries; 4xx is honest about "we rejected this
    // request" vs 5xx "we crashed").
    if (err instanceof stripeService.StripeWebhookSignatureError) {
      res.status(400).json({ success: false, error: { code: 'STRIPE_SIGNATURE_INVALID', message: 'Stripe webhook signature verification failed' } });
      return;
    }
    next(err);
  }
};

export const getStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Router-level authenticateJWT guarantees req.user is present.
    const { institutionId } = req.user!;
    const sub = await prisma.subscription.findUnique({
      where: { institutionId },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
    res.json({ success: true, data: sub ?? { tier: 'FREE', status: 'inactive', payments: [] } });
  } catch (err) { next(err); }
};

export const cancelSub = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { institutionId } = req.user!;
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
    const { institutionId } = req.user!;
    const sub = await prisma.subscription.findUnique({
      where: { institutionId },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });
    res.json({ success: true, data: sub?.payments ?? [] });
  } catch (err) { next(err); }
};
