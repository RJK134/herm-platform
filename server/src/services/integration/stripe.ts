import prisma from '../../utils/prisma';

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

function getStripe() {
  if (!STRIPE_SECRET) return null;
  // Dynamic require so the app still boots when the optional `stripe` dep is absent.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Stripe = require('stripe');
  return new Stripe(STRIPE_SECRET, { apiVersion: '2024-09-30.acacia' }) as import('stripe').default;
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

export async function handleWebhook(rawBody: Buffer, signature: string): Promise<{ handled: boolean; event?: string }> {
  const stripe = getStripe();
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return { handled: false };

  let event: import('stripe').Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch {
    return { handled: false };
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as import('stripe').Stripe.Checkout.Session;
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
    const sub = event.data.object as import('stripe').Stripe.Subscription;
    const dbSub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: sub.id } });
    if (dbSub) {
      await prisma.subscription.update({ where: { id: dbSub.id }, data: { tier: 'FREE', status: 'cancelled' } });
    }
    // Also check vendor
    const vendor = await prisma.vendorAccount.findFirst({ where: { stripeSubscriptionId: sub.id } });
    if (vendor) {
      await prisma.vendorAccount.update({ where: { id: vendor.id }, data: { tier: 'BASIC' } });
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
