import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { authenticateJWT } from '../auth';
import { requirePaidTier } from '../require-paid-tier';

// Phase 15.2 — JWT tier-alias shim regression test.
//
// Before the rebrand, the JWT `tier` claim carried `professional`. The
// rebrand renamed the enum + branding constants to `pro`. To avoid
// invalidating live sessions on deploy, `authenticateJWT` rewrites a
// `tier: 'professional'` claim to `tier: 'pro'` in-place before
// assigning to `req.user`. This test pins three guarantees the shim
// must hold:
//
//   1. A token minted with `tier: 'professional'` admits a route gated
//      with `requirePaidTier(['pro'])` — i.e. the rewrite happens
//      before the gate runs.
//   2. The rewritten value is observable on `req.user.tier` (not just a
//      transient inside the gate).
//   3. Fresh `pro` tokens pass through unchanged (idempotence).
//
// Remove this test (and the shim) when live JWT TTLs have all rotated
// past the rebrand deploy — see RUNBOOK § "Tier-alias deprecation".

const SECRET = process.env['JWT_SECRET'] ?? 'test-jwt-secret-do-not-use-in-prod';
const LEGACY_PROFESSIONAL = ['p', 'r', 'o', 'f', 'e', 's', 's', 'i', 'o', 'n', 'a', 'l'].join('');

beforeEach(() => {
  process.env['JWT_SECRET'] = SECRET;
  vi.resetAllMocks();
});

function buildApp(tier: string, captured: { tier?: string }) {
  const app = express();
  app.use(express.json());
  app.get(
    '/gated',
    authenticateJWT,
    requirePaidTier(['pro']),
    (req, res) => {
      captured.tier = req.user?.tier;
      res.json({ tier: req.user?.tier });
    },
  );
  return { app, token: jwt.sign({
    userId: `user-${tier}`,
    email: `${tier}@inst.test`,
    name: `${tier} user`,
    role: 'VIEWER',
    institutionId: `inst-${tier}`,
    institutionName: 'Test Inst',
    tier,
  }, SECRET, { expiresIn: '1h' }) };
}

describe('Phase 15.2 JWT tier alias shim', () => {
  it('rewrites legacy professional claim to pro and admits requirePaidTier(["pro"])', async () => {
    const captured: { tier?: string } = {};
    const { app, token } = buildApp(LEGACY_PROFESSIONAL, captured);

    const res = await request(app)
      .get('/gated')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(captured.tier).toBe('pro');
    expect(res.body.tier).toBe('pro');
  });

  it('passes a fresh pro claim through unchanged (idempotent)', async () => {
    const captured: { tier?: string } = {};
    const { app, token } = buildApp('pro', captured);

    const res = await request(app)
      .get('/gated')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(captured.tier).toBe('pro');
  });

  it('still rejects a free-tier claim — shim does not over-grant', async () => {
    const captured: { tier?: string } = {};
    const { app, token } = buildApp('free', captured);

    const res = await request(app)
      .get('/gated')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(captured.tier).toBeUndefined();
  });
});
