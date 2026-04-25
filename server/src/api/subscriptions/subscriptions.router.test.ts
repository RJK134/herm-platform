import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { errorHandler } from '../../middleware/errorHandler';
import { requestId } from '../../middleware/requestId';

vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { stripeMock, prismaMock } = vi.hoisted(() => ({
  stripeMock: {
    createCheckoutSession: vi.fn(),
    handleWebhook: vi.fn(),
    cancelSubscription: vi.fn(),
  },
  prismaMock: {
    subscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));
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
  // Match production middleware order in app.ts: body parsing before routes.
  // The webhook's raw-body handling is exercised via mock — these tests
  // assert the auth contract (anonymous bounced; authenticated reaches the
  // controller; webhook stays public) and not raw-body wire format.
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
    const res = await request(buildApp()).post('/api/subscriptions/checkout').send({ tier: 'professional' });
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
      .send({ tier: 'professional', institutionId: 'spoofed-inst' });
    expect(res.status).toBe(200);
    expect(stripeMock.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'professional',
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
    // Auth invariant: an anonymous caller MUST reach the webhook handler
    // (Stripe signature verification is the auth, not JWT). We don't assert
    // raw-body wire format here — that is exercised end-to-end against
    // Stripe's CLI in the runbook.
    expect(res.status).toBe(200);
    expect(stripeMock.handleWebhook).toHaveBeenCalledOnce();
  });
});
