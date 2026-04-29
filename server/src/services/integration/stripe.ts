import Stripe from 'stripe';
import prisma from '../../utils/prisma';
import { logger } from '../../lib/logger';
import { sendEmail } from '../../lib/email';
import { renderBillingEmail } from '../../lib/email-templates';

// Graceful no-op if Stripe not configured
const STRIPE_SECRET = process.env['STRIPE_SECRET_KEY'];
const STRIPE_WEBHOOK_SECRET = process.env['STRIPE_WEBHOOK_SECRET'];
const APP_URL = process.env['APP_URL'] ?? 'http://localhost:5173';

// Price IDs from environment
const PRICE_IDS = {
  institutionProfessional: process.env['STRIPE_PRICE_INST_PRO'] ?? '',
  institutionEnterprise:   process.env['STRIPE_PRICE_INST_ENT'] ?? '',
  vendorEnhanced:          process.env['STRIPE_PRICE_VENDOR_ENH'] ?? '',
  vendorPremium:           process.env['STRIPE_PRICE_VENDOR_PREM'] ?? '',
};

type TierKey = keyof typeof PRICE_IDS;

function getStripe(): Stripe | null {
  if (!STRIPE_SECRET) return null;
  // Pin an explicit API version so a Stripe SDK upgrade doesn't silently
  // change response shapes under us. Cast through `as Stripe.LatestApiVersion`
  // because the SDK's type narrows to whatever its bundled "latest" is —
  // we want to pin independent of that and validate via our test fixtures.
  return new Stripe(STRIPE_SECRET, {
    apiVersion: '2024-09-30.acacia' as unknown as Stripe.LatestApiVersion,
  });
}

/**
 * Health-probe accessor. Returns the Stripe client when configured, or
 * `null` so the caller can skip the probe entirely. Kept separate from
 * the internal `getStripe()` so the health controller doesn't depend on
 * the rest of the billing service surface.
 */
export function getStripeForHealthCheck(): Stripe | null {
  return getStripe();
}

export interface CheckoutResult {
  url: string | null;
  configured: boolean;
  message?: string;
}

export async function createCheckoutSession(params: {
  tier: TierKey;
  email: string;
  institutionId?: string;
  vendorAccountId?: string;
  isVendor?: boolean;
}): Promise<CheckoutResult> {
  const stripe = getStripe();
  if (!stripe) {
    return {
      url: null,
      configured: false,
      message: 'Payment processing is not configured on this instance. Contact support to upgrade your subscription.',
    };
  }

  const priceId = PRICE_IDS[params.tier];
  if (!priceId) {
    return { url: null, configured: false, message: `Price not configured for tier: ${params.tier}` };
  }

  const metadata: Record<string, string> = {
    tier: params.tier,
    isVendor: params.isVendor ? 'true' : 'false',
  };
  if (params.institutionId) metadata['institutionId'] = params.institutionId;
  if (params.vendorAccountId) metadata['vendorAccountId'] = params.vendorAccountId;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: params.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/subscription`,
    metadata,
    subscription_data: { metadata },
  });

  return { url: session.url, configured: true };
}

/**
 * Sentinel error that the controller / errorHandler use to translate a
 * signature-verification failure into a non-200 response, so Stripe retries
 * the event instead of treating it as accepted-but-unhandled.
 */
export class StripeWebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeWebhookSignatureError';
  }
}

/**
 * Notify all INSTITUTION_ADMIN users of an institution about a billing event.
 * Best-effort — failure to write notifications must not abort webhook
 * processing (the webhook still needs to update DB state and ack to Stripe).
 *
 * Phase 10.2: also dispatch an email to each admin's address. The in-app
 * Notification row remains the source of truth ("did the user get told"),
 * email is the convenience channel that delivers the news while the admin
 * is away from the platform. Email is no-op if SMTP is not configured —
 * the in-app path still runs.
 */
async function notifyInstitutionAdmins(
  institutionId: string,
  notification: { type: string; title: string; message: string; link?: string },
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { institutionId, role: 'INSTITUTION_ADMIN' },
      select: { id: true, email: true },
    });
    if (admins.length === 0) return;
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        link: notification.link ?? null,
      })),
    });

    // Email each admin individually so a delivery failure to one address
    // doesn't suppress the rest. sendEmail already swallows errors and
    // returns { sent: false }, so awaiting in parallel is safe.
    const emailRecipients = admins.map((a) => a.email).filter((e): e is string => Boolean(e));
    if (emailRecipients.length > 0) {
      const { text, html } = renderBillingEmail(notification);
      await Promise.all(
        emailRecipients.map((to) =>
          sendEmail({
            to,
            subject: notification.title,
            text,
            html,
          }),
        ),
      );
    }
  } catch (err) {
    logger.warn(
      { institutionId, err: err instanceof Error ? err.message : String(err) },
      'failed to write billing notification — webhook continues',
    );
  }
}

/**
 * Map a Stripe price ID back to our `SubscriptionTier`. Used by
 * `customer.subscription.updated` to reconcile mid-cycle plan changes.
 * Returns null when the price ID isn't one we recognise (e.g. a
 * one-off or a vendor price).
 */
function tierFromPriceId(priceId: string | null | undefined): import('@prisma/client').SubscriptionTier | null {
  if (!priceId) return null;
  if (priceId === PRICE_IDS.institutionProfessional) return 'PROFESSIONAL';
  if (priceId === PRICE_IDS.institutionEnterprise) return 'ENTERPRISE';
  return null;
}

export async function handleWebhook(rawBody: Buffer, signature: string): Promise<{ handled: boolean; event?: string }> {
  const stripe = getStripe();
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return { handled: false };

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    // Throw rather than returning `{ handled: false }`. The caller turns this
    // into a non-200 so Stripe retries the event with backoff. Today's silent
    // swallow ack'd Stripe with 200 even when the signature was invalid,
    // so a bad rotation or a misconfigured secret would lose every event.
    const message = err instanceof Error ? err.message : 'Stripe webhook signature verification failed';
    logger.warn({ err: message }, 'stripe webhook signature verification failed');
    throw new StripeWebhookSignatureError(message);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta = session.metadata ?? {};
    const isVendor = meta['isVendor'] === 'true';
    const tier = meta['tier'] as TierKey;

    if (isVendor && meta['vendorAccountId']) {
      const tierMap: Record<string, string> = {
        vendorEnhanced: 'ENHANCED',
        vendorPremium: 'PREMIUM',
      };
      await prisma.vendorAccount.update({
        where: { id: meta['vendorAccountId'] },
        data: {
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
          tier: (tierMap[tier] ?? 'BASIC') as import('@prisma/client').VendorTier,
        },
      });
    } else if (meta['institutionId']) {
      const tierMap: Record<string, import('@prisma/client').SubscriptionTier> = {
        institutionProfessional: 'PROFESSIONAL',
        institutionEnterprise: 'ENTERPRISE',
      };
      const sub = await prisma.subscription.findUnique({ where: { institutionId: meta['institutionId'] } });
      if (sub) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            tier: tierMap[tier] ?? 'FREE',
            status: 'active',
            // Successful checkout resets dunning state — even if a
            // previous billing period had failed.
            dunningState: 'active',
          },
        });
        await prisma.payment.create({
          data: {
            subscriptionId: sub.id,
            amount: (session.amount_total ?? 0) / 100,
            currency: (session.currency ?? 'gbp').toUpperCase(),
            status: 'succeeded',
            stripePaymentId: session.payment_intent as string | undefined,
            paidAt: new Date(),
          },
        });
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const dbSub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: sub.id } });
    if (dbSub) {
      await prisma.subscription.update({
        where: { id: dbSub.id },
        data: { tier: 'FREE', status: 'cancelled', dunningState: 'cancelled' },
      });
    }
    // Also check vendor
    const vendor = await prisma.vendorAccount.findFirst({ where: { stripeSubscriptionId: sub.id } });
    if (vendor) {
      await prisma.vendorAccount.update({ where: { id: vendor.id }, data: { tier: 'BASIC' } });
    }
  }

  // ── Mid-cycle plan change ──────────────────────────────────────────────
  // Stripe sends `customer.subscription.updated` for plan changes, payment-
  // method updates, and various other reasons. Reconcile our `tier` from
  // the active price ID so an upgrade/downgrade applied in Stripe takes
  // effect on our side without a fresh checkout.
  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    const dbSub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: sub.id } });
    if (dbSub) {
      const priceId = sub.items?.data?.[0]?.price?.id;
      const newTier = tierFromPriceId(priceId);
      if (newTier && newTier !== dbSub.tier) {
        logger.info(
          { subscriptionId: dbSub.id, fromTier: dbSub.tier, toTier: newTier, priceId },
          'stripe subscription tier changed mid-cycle',
        );
        await prisma.subscription.update({
          where: { id: dbSub.id },
          data: { tier: newTier },
        });
        await notifyInstitutionAdmins(dbSub.institutionId, {
          type: 'BILLING',
          title: 'Subscription updated',
          message: `Your subscription tier changed from ${dbSub.tier} to ${newTier}.`,
          link: '/subscription',
        });
      }
    }
  }

  // ── Failed renewal → enter dunning ─────────────────────────────────────
  // Stripe sends `invoice.payment_failed` after a renewal attempt fails.
  // Mark the subscription past_due and notify the admin so they can fix
  // the payment method before Stripe's smart-retry exhausts and the
  // subscription is cancelled.
  if (event.type === 'invoice.payment_failed') {
    // The Stripe SDK's `Invoice` type evolves across API versions — `subscription`
    // and `payment_intent` are sometimes typed as expandable links, sometimes as
    // strings, and the field set changes between dahlia/acacia/etc. Cast to a
    // permissive shape so we read what's on the wire regardless of SDK version.
    const invoice = event.data.object as Stripe.Invoice & {
      subscription?: string | { id: string } | null;
      payment_intent?: string | { id: string } | null;
    };
    const stripeSubId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id;
    if (stripeSubId) {
      const dbSub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: stripeSubId } });
      if (dbSub) {
        await prisma.subscription.update({
          where: { id: dbSub.id },
          data: { dunningState: 'past_due' },
        });
        const paymentIntentId =
          typeof invoice.payment_intent === 'string'
            ? invoice.payment_intent
            : invoice.payment_intent?.id ?? null;
        await prisma.payment.create({
          data: {
            subscriptionId: dbSub.id,
            amount: (invoice.amount_due ?? 0) / 100,
            currency: (invoice.currency ?? 'gbp').toUpperCase(),
            status: 'failed',
            stripePaymentId: paymentIntentId,
            paidAt: null,
          },
        });
        await notifyInstitutionAdmins(dbSub.institutionId, {
          type: 'BILLING',
          title: 'Payment failed',
          message:
            'We were unable to charge your payment method for the latest renewal. ' +
            'Please update your billing details to avoid losing access to paid features.',
          link: '/subscription',
        });
      }
    }
  }

  // ── Refund issued ──────────────────────────────────────────────────────
  // Match the Payment row by `stripePaymentId` (which we set to
  // `payment_intent` on the success path). Mark it `refunded` so the
  // admin's invoices view reflects reality.
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntent = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
    if (paymentIntent) {
      const result = await prisma.payment.updateMany({
        where: { stripePaymentId: paymentIntent },
        data: { status: 'refunded' },
      });
      if (result.count > 0) {
        // Find the institution so we can notify admins. updateMany doesn't
        // return rows, so re-read.
        const payment = await prisma.payment.findFirst({
          where: { stripePaymentId: paymentIntent },
          select: { subscription: { select: { institutionId: true } } },
        });
        if (payment?.subscription) {
          await notifyInstitutionAdmins(payment.subscription.institutionId, {
            type: 'BILLING',
            title: 'Refund issued',
            message: `A refund of ${(charge.amount_refunded ?? 0) / 100} ${(charge.currency ?? 'gbp').toUpperCase()} has been issued for your subscription.`,
            link: '/subscription',
          });
        }
      }
    }
  }

  // ── Dispute opened ─────────────────────────────────────────────────────
  // Disputes are a paging-grade event for the billing team. Pause the
  // dunning state so we don't keep retrying charges while the dispute
  // is being resolved, and notify the admin loudly.
  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object as Stripe.Dispute;
    const paymentIntent = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : null;
    if (paymentIntent) {
      const payment = await prisma.payment.findFirst({
        where: { stripePaymentId: paymentIntent },
        select: { subscription: { select: { id: true, institutionId: true } } },
      });
      if (payment?.subscription) {
        await prisma.subscription.update({
          where: { id: payment.subscription.id },
          data: { dunningState: 'paused' },
        });
        await notifyInstitutionAdmins(payment.subscription.institutionId, {
          type: 'BILLING',
          title: 'Payment dispute opened',
          message:
            `A dispute was opened on a recent charge (${(dispute.amount ?? 0) / 100} ${(dispute.currency ?? 'gbp').toUpperCase()}). ` +
            'Our billing team has been notified. Please contact support if this is unexpected.',
          link: '/subscription',
        });
      }
    }
  }

  return { handled: true, event: event.type };
}

export async function getSubscriptionStatus(stripeCustomerId: string) {
  const stripe = getStripe();
  if (!stripe) return null;
  const subscriptions = await stripe.subscriptions.list({ customer: stripeCustomerId, status: 'active', limit: 1 });
  return subscriptions.data[0] ?? null;
}

export async function cancelSubscription(stripeSubscriptionId: string) {
  const stripe = getStripe();
  if (!stripe) return null;
  return stripe.subscriptions.cancel(stripeSubscriptionId);
}

export async function getInvoices(stripeCustomerId: string) {
  const stripe = getStripe();
  if (!stripe) return [];
  const invoices = await stripe.invoices.list({ customer: stripeCustomerId, limit: 12 });
  return invoices.data.map(inv => ({
    id: inv.id,
    amount: (inv.amount_paid ?? 0) / 100,
    currency: (inv.currency ?? 'gbp').toUpperCase(),
    status: inv.status,
    date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
    invoiceUrl: inv.hosted_invoice_url,
  }));
}

// Tier pricing reference (no Stripe, for display only)
export const TIER_PRICING = {
  institutionPro:     { amount: 2500,  currency: 'GBP', period: 'year', label: 'Institution Professional' },
  institutionEnt:     { amount: 8000,  currency: 'GBP', period: 'year', label: 'Institution Enterprise' },
  vendorEnhanced:     { amount: 3500,  currency: 'GBP', period: 'year', label: 'Vendor Enhanced' },
  vendorPremium:      { amount: 12000, currency: 'GBP', period: 'year', label: 'Vendor Premium Partner' },
};
