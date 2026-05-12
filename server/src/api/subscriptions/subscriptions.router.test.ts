import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { errorHandler } from '../../middleware/errorHandler';
import { requestId } from '../../middleware/requestId';

vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { stripeMock, prismaMock, StripeWebhookSignatureError } = vi.hoisted(() => {
  // Match the real class so `instanceof` checks in the controller resolve.
  // Re-declared locally in the mock instead of imported so the hoist works.
  class StripeWebhookSignatureError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'StripeWebhookSignatureError';
    }
  }
  return {
    stripeMock: {
      createCheckoutSession: vi.fn(),
      handleWebhook: vi.fn(),
      cancelSubscription: vi.fn(),
      StripeWebhookSignatureError,
    },
    prismaMock: {
      subscription: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    },
    StripeWebhookSignatureError,
  };
});
vi.mock('../../services/stripe', () => stripeMock);
vi.mock('../../utils/prisma', () => ({ default: prismaMock }));

import subscriptionsRouter from './subscriptions.router';

function signToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      userId: 'user-1',
      email: 'user@inst.test',
      name: 'Test User',
      role: 'VIEWER',
      institutionId: 'inst-1',
      institutionName: 'Test Inst',
      tier: 'free',
      ...overrides,
    },
    process.env['JWT_SECRET'] ?? 'test-jwt-secret-do-not-use-in-prod',
  );
}

function buildApp() {
  const app = express();
  app.use(requestId);
  // Mirror the production middleware order from app.ts:
  //   1. raw-body parser, scoped to the webhook path only
  //   2. global express.json() for everything else
  // This is the order that allows `req.body` to be an unparsed Buffer for
  // the webhook handler (so Stripe signature verification works) while
  // every other route still gets a parsed JSON body.
  app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use('/api/subscriptions', subscriptionsRouter);
  app.use(errorHandler);
  return app;
}

describe('subscriptions router auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects anonymous /checkout with 401 (no Stripe call)', async () => {
    const res = await request(buildApp()).post('/api/subscriptions/checkout').send({ tier: 'pro' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    expect(stripeMock.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects anonymous /status with 401', async () => {
    const res = await request(buildApp()).get('/api/subscriptions/status');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('rejects anonymous /cancel with 401 (no Stripe call)', async () => {
    const res = await request(buildApp()).post('/api/subscriptions/cancel');
    expect(res.status).toBe(401);
    expect(stripeMock.cancelSubscription).not.toHaveBeenCalled();
  });

  it('rejects anonymous /invoices with 401', async () => {
    const res = await request(buildApp()).get('/api/subscriptions/invoices');
    expect(res.status).toBe(401);
  });

  it('lets an authenticated free-tier caller read /status', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce(null);
    const token = signToken({ tier: 'free' });
    const res = await request(buildApp())
      .get('/api/subscriptions/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.tier).toBe('FREE');
    expect(prismaMock.subscription.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { institutionId: 'inst-1' } }),
    );
  });

  it('passes institutionId from JWT (never the body) to Stripe checkout', async () => {
    stripeMock.createCheckoutSession.mockResolvedValueOnce({ url: 'https://stripe.test/co/sess_1' });
    const token = signToken({ institutionId: 'inst-from-token', email: 'jwt@inst.test' });
    const res = await request(buildApp())
      .post('/api/subscriptions/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ tier: 'pro', institutionId: 'spoofed-inst' });
    expect(res.status).toBe(200);
    expect(stripeMock.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'pro',
        institutionId: 'inst-from-token',
        email: 'jwt@inst.test',
      }),
    );
  });

  it('keeps the Stripe webhook public (no JWT required)', async () => {
    stripeMock.handleWebhook.mockResolvedValueOnce({ handled: true, event: 'checkout.session.completed' });
    const res = await request(buildApp())
      .post('/api/subscriptions/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=0,v1=fake')
      .send({ id: 'evt_test', type: 'checkout.session.completed' });
    expect(res.status).toBe(200);
    expect(stripeMock.handleWebhook).toHaveBeenCalledOnce();
  });

  it('responds 400 STRIPE_SIGNATURE_INVALID when handleWebhook throws StripeWebhookSignatureError', async () => {
    // Pre-fix, the service swallowed signature failures and returned
    // `{ handled: false }` — the controller responded 200 and Stripe
    // treated the event as ack'd. The new behaviour: handleWebhook
    // throws StripeWebhookSignatureError, the controller maps it to
    // 400 so Stripe retries with backoff.
    stripeMock.handleWebhook.mockRejectedValueOnce(
      new StripeWebhookSignatureError('Webhook signature verification failed'),
    );
    const res = await request(buildApp())
      .post('/api/subscriptions/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=0,v1=fake')
      .send({ id: 'evt_bad_sig', type: 'checkout.session.completed' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('STRIPE_SIGNATURE_INVALID');
  });

  it('forwards an unparsed Buffer (not parsed JSON) to stripe.handleWebhook', async () => {
    // Regression guard for the body-parser ordering bug: the global
    // `express.json()` was previously consuming the request body before
    // the per-route raw parser ran, so `req.body` was a parsed object
    // cast to Buffer and Stripe.webhooks.constructEvent rejected it.
    // After moving `app.use('/api/subscriptions/webhook', express.raw(...))`
    // ABOVE `express.json()`, the controller MUST observe a real Buffer.
    stripeMock.handleWebhook.mockResolvedValueOnce({ handled: true, event: 'evt_test' });
    const payload = JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed' });
    const res = await request(buildApp())
      .post('/api/subscriptions/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=0,v1=fake')
      .send(payload);
    expect(res.status).toBe(200);
    expect(stripeMock.handleWebhook).toHaveBeenCalledOnce();
    const [body, signature] = stripeMock.handleWebhook.mock.calls[0]!;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect((body as Buffer).toString('utf8')).toBe(payload);
    expect(signature).toBe('t=0,v1=fake');
  });
});
