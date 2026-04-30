/**
 * Phase 11.6 — live OIDC integration tests against `oauth2-mock-server`.
 *
 * Closes the deferred ADR-0001 follow-up (Q6): "Live mock-IdP integration
 * tests — `saml-test-idp` + `oauth2-mock-server` per the ADR. Today's
 * tests mock `node-saml` and `openid-client` directly."
 *
 * Why this matters
 *   The unit-mock approach in `sso.flows.test.ts` pins HERM's
 *   wiring contract (controllers call the right helper with the right
 *   args) but says nothing about whether `openid-client` actually
 *   discovers, exchanges, and verifies tokens against a real OIDC
 *   issuer. This file is the end-to-end pin: HERM SP ↔ in-process
 *   OAuth2Server, no library mocks. A regression in OIDC-flow plumbing
 *   that the unit tests would miss surfaces here.
 *
 * What this test does
 *   1. Spawns `oauth2-mock-server` on an OS-assigned port.
 *   2. Hooks `BeforeTokenSigning` to inject an `email` claim into the
 *      issued id_token (the default token payload doesn't carry one,
 *      and HERM rejects id_tokens without an email).
 *   3. Mocks Prisma (just like the unit suite) so the SSO read path
 *      returns an Enterprise institution whose IdP row points at the
 *      live mock issuer.
 *   4. Runs the SAML/OIDC code path end-to-end through supertest +
 *      `fetch`, including the real /authorize → /token → JWKS dance.
 *   5. Asserts a session JWT is minted at the end with the right
 *      institutionId, role, and tier.
 *
 * What this test deliberately doesn't cover
 *   - Token-replay defences (out of scope for v1, gated on a session-
 *     store landing).
 *   - SAML — covered separately in `sso.live-saml.test.ts` once an
 *     in-process SAML test IdP is wired up.
 *   - Integration with the real Postgres — Prisma is still mocked.
 *     A full DB-backed end-to-end is a separate follow-up.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { OAuth2Server } from 'oauth2-mock-server';

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Redis disabled — the OIDC flow store falls back to in-memory, which is
// what we want for an in-process integration test (no shared infra).
vi.mock('../lib/redis', () => ({ getRedis: () => null }));

// Prisma is the only piece we keep mocked. Real DB calls would balloon
// this test's blast radius and we already cover the persistence boundary
// in the unit suite.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    institution: { findUnique: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock('../utils/prisma', () => ({ default: prismaMock }));

import ssoRouter from '../api/sso/sso.router';
import { errorHandler } from '../middleware/errorHandler';
import { requestId } from '../middleware/requestId';
import { __resetFlowStoreForTests } from '../api/sso/flow-store';
import { __resetOidcConfigCacheForTests } from '../api/sso/oidc';

const SECRET = process.env['JWT_SECRET'] ?? 'test-jwt-secret-do-not-use-in-prod';

let mockIssuer: OAuth2Server;
let issuerUrl: string;
const TEST_USER_EMAIL = 'oidc-tester@uni.example.ac.uk';

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/sso', ssoRouter);
  app.use(errorHandler);
  return app;
}

function institutionWithLiveOidc() {
  return {
    id: 'inst-live-1',
    slug: 'uni-live',
    name: 'Live OIDC University',
    subscription: { tier: 'ENTERPRISE' },
    ssoProvider: {
      id: 'idp-live-1',
      institutionId: 'inst-live-1',
      protocol: 'OIDC',
      enabled: true,
      displayName: 'Sign in with Live IdP',
      samlEntityId: null,
      samlSsoUrl: null,
      samlCert: null,
      // The mock server uses its own JWKS — these three are the SP-side
      // values our controller reads. The clientId/Secret fields are
      // accepted by oauth2-mock-server without configuration.
      oidcIssuer: '',
      oidcClientId: 'herm-live-test-client',
      oidcClientSecret: 'herm-live-test-secret',
      jitProvisioning: true,
      defaultRole: 'VIEWER',
    },
  };
}

beforeAll(async () => {
  // Spawn the live OIDC issuer on an OS-assigned port (port=0).
  // Round-trip startup completes once `start()` resolves.
  mockIssuer = new OAuth2Server();
  await mockIssuer.issuer.keys.generate('RS256');
  await mockIssuer.start(0, '127.0.0.1');
  const addr = mockIssuer.address();
  issuerUrl = `http://127.0.0.1:${addr.port}`;
  mockIssuer.issuer.url = issuerUrl;

  // Inject an `email` claim into every issued id_token. HERM's OIDC
  // helper rejects assertions whose claims have no usable email.
  mockIssuer.service.on('beforeTokenSigning', (token) => {
    token.payload['email'] = TEST_USER_EMAIL;
    token.payload['name'] = 'Live OIDC Tester';
  });
}, 30_000);

afterAll(async () => {
  if (mockIssuer && mockIssuer.listening) {
    await mockIssuer.stop();
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
  __resetFlowStoreForTests();
  __resetOidcConfigCacheForTests();
});

describe('OIDC end-to-end through oauth2-mock-server', () => {
  it('completes the full discovery → authorize → token → callback dance', async () => {
    const inst = institutionWithLiveOidc();
    inst.ssoProvider.oidcIssuer = issuerUrl;
    prismaMock.institution.findUnique.mockResolvedValue(inst);

    // The user the IdP asserts doesn't exist yet — exercise the JIT
    // provisioning path so completeSsoSignIn ends in a User.create.
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'user-jit',
      email: TEST_USER_EMAIL,
      name: 'Live OIDC Tester',
      role: 'VIEWER',
      institutionId: inst.id,
      mfaEnabledAt: null,
      institution: {
        id: inst.id,
        name: inst.name,
        subscription: { tier: 'ENTERPRISE' },
      },
    });

    const app = buildApp();

    // ── Step 1: HERM kicks off the flow.
    // Controller is synchronous about its side effect (state stored in
    // the in-memory flow-store) before redirecting to /authorize.
    const loginRes = await request(app).get('/api/sso/uni-live/login');
    expect(loginRes.status).toBe(302);
    const authorizeUrl = loginRes.headers['location'] as string;
    expect(authorizeUrl).toContain(issuerUrl);
    const authorizeUrlObj = new URL(authorizeUrl);
    const ourState = authorizeUrlObj.searchParams.get('state');
    expect(ourState).toBeTruthy();

    // ── Step 2: pretend to be the user-agent. Hit the issuer's
    // authorize endpoint (real oauth2-mock-server, no follow). The
    // server replies with a 302 to the registered redirect_uri,
    // carrying `code` + the original `state`.
    const authorizeResp = await fetch(authorizeUrl, { redirect: 'manual' });
    expect(authorizeResp.status).toBe(302);
    const callbackUrl = authorizeResp.headers.get('location');
    expect(callbackUrl).toBeTruthy();
    const callbackUrlObj = new URL(callbackUrl as string);
    const code = callbackUrlObj.searchParams.get('code');
    const returnedState = callbackUrlObj.searchParams.get('state');
    expect(code).toBeTruthy();
    expect(returnedState).toBe(ourState);

    // ── Step 3: HERM's callback runs the real openid-client
    // authorizationCodeGrant, hitting the mock issuer's /token and
    // /jwks endpoints. The id_token is verified against the
    // round-robin RS256 key we generated in beforeAll.
    const callbackRes = await request(app)
      .get('/api/sso/uni-live/oidc/callback')
      .query({ code, state: returnedState });

    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers['location']).toMatch(/\/login\/sso\?token=/);

    const tokenStr = new URL(
      callbackRes.headers['location'] as string,
      'http://localhost',
    ).searchParams.get('token');
    expect(tokenStr).toBeTruthy();
    const decoded = jwt.verify(tokenStr as string, SECRET) as Record<string, unknown>;
    expect(decoded['email']).toBe(TEST_USER_EMAIL);
    expect(decoded['institutionId']).toBe(inst.id);
    expect(decoded['role']).toBe('VIEWER');
    expect(decoded['tier']).toBe('enterprise');

    // The JIT-provisioning audit row must have fired.
    const auditCalls = prismaMock.auditLog.create.mock.calls as unknown as Array<
      [{ data: { action: string } }]
    >;
    expect(auditCalls.map((c) => c[0].data.action)).toContain('auth.sso.jit_provisioned');
  }, 30_000);

  it('rejects an unknown state at the callback (replay / mismatched-flow defence)', async () => {
    const inst = institutionWithLiveOidc();
    inst.ssoProvider.oidcIssuer = issuerUrl;
    prismaMock.institution.findUnique.mockResolvedValue(inst);

    const app = buildApp();
    const res = await request(app)
      .get('/api/sso/uni-live/oidc/callback')
      .query({ code: 'forged-code', state: 'never-issued' });

    // The opaque error redirect is what the SPA renders as a generic
    // sso_failed banner; the real reason (state miss) is logged but
    // not echoed.
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/\/login\?error=sso_failed/);
  }, 30_000);
});
