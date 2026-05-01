/**
 * Phase 11.6 — live SAML integration tests against an in-process IdP.
 *
 * Companion to `sso.live-oidc.test.ts`. Where the OIDC suite uses
 * `oauth2-mock-server` (a real HTTP issuer), the SAML suite builds a
 * minimal in-process IdP with `xml-crypto` (helper at
 * `src/test/saml-test-idp.ts`). The asymmetry is deliberate: SAML
 * doesn't need an HTTP server because the SP only ingests the signed
 * `<samlp:Response>` POSTed to the ACS — we generate that response
 * in-process and feed it through the real ACS endpoint with supertest.
 *
 * What's exercised end-to-end
 *   - Real `node-saml` `validatePostResponseAsync` parses the Response.
 *   - Real X.509 / RSA-SHA256 signature verification against the cert
 *     stored on the SsoIdentityProvider row.
 *   - Real `Issuer`, `Audience`, `NotBefore` / `NotOnOrAfter`, and
 *     `Destination` checks.
 *   - The full SP-side post-assertion path (cross-institution check,
 *     JIT provisioning, MFA bypass, session JWT minting).
 *
 * What's not exercised
 *   - The IdP-redirect leg of the dance (the AuthnRequest itself).
 *     That's covered as a unit pin in `sso.flows.test.ts`.
 *   - Full UKAMF-style SP-signed AuthnRequests + signed metadata —
 *     covered separately by `sp-signing.test.ts` (Phase 11.3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createSamlTestIdp } from '../test/saml-test-idp';
import { getSpEntityId, getSamlAcsUrl } from '../lib/sso-config';

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../lib/redis', () => ({ getRedis: () => null }));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    institution: { findUnique: vi.fn(), findFirst: vi.fn() },
    ssoIdentityProvider: { findFirst: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock('../utils/prisma', () => ({ default: prismaMock }));

import ssoRouter from '../api/sso/sso.router';
import { errorHandler } from '../middleware/errorHandler';
import { requestId } from '../middleware/requestId';

const SECRET = process.env['JWT_SECRET'] ?? 'test-jwt-secret-do-not-use-in-prod';
const TEST_USER_EMAIL = 'saml-tester@uni.example.ac.uk';

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use('/api/sso', ssoRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('SAML end-to-end through an in-process signing IdP', () => {
  it('verifies a real signed assertion and JIT-provisions the user', async () => {
    const idp = createSamlTestIdp({ entityId: 'https://idp.live.test/saml/idp' });

    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue({
      id: 'idp-saml-1',
      institutionId: 'inst-saml-1',
      protocol: 'SAML',
      enabled: true,
      displayName: 'Sign in with Live SAML',
      samlEntityId: idp.entityId,
      samlSsoUrl: 'https://idp.live.test/saml/sso',
      samlCert: idp.cert,
      oidcIssuer: null,
      oidcClientId: null,
      oidcClientSecret: null,
      jitProvisioning: true,
      defaultRole: 'VIEWER',
      priority: 100,
      institution: {
        id: 'inst-saml-1',
        slug: 'uni-saml',
        name: 'SAML University',
        subscription: { tier: 'ENTERPRISE' },
      },
    });
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'user-saml-jit',
      email: TEST_USER_EMAIL,
      name: 'SAML Tester',
      role: 'VIEWER',
      institutionId: 'inst-saml-1',
      mfaEnabledAt: null,
      institution: {
        id: 'inst-saml-1',
        name: 'SAML University',
        subscription: { tier: 'ENTERPRISE' },
      },
    });

    // Build a signed SAML response targeting the SP's actual ACS URL
    // and entityID — which is what node-saml will check on validation.
    const responseXml = idp.buildSamlResponse({
      spEntityId: getSpEntityId(),
      acsUrl: getSamlAcsUrl('uni-saml'),
      nameId: TEST_USER_EMAIL,
      attributes: { displayName: 'SAML Tester' },
    });
    const samlResponseB64 = Buffer.from(responseXml, 'utf8').toString('base64');

    const app = buildApp();
    const res = await request(app)
      .post('/api/sso/uni-saml/saml/acs')
      .type('form')
      .send({ SAMLResponse: samlResponseB64, RelayState: 'uni-saml' });

    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/\/login\/sso\?token=/);

    const tokenStr = new URL(
      res.headers['location'] as string,
      'http://localhost',
    ).searchParams.get('token');
    expect(tokenStr).toBeTruthy();
    const decoded = jwt.verify(tokenStr as string, SECRET) as Record<string, unknown>;
    expect(decoded['email']).toBe(TEST_USER_EMAIL);
    expect(decoded['institutionId']).toBe('inst-saml-1');
    expect(decoded['role']).toBe('VIEWER');

    const auditCalls = prismaMock.auditLog.create.mock.calls as unknown as Array<
      [{ data: { action: string } }]
    >;
    expect(auditCalls.map((c) => c[0].data.action)).toContain('auth.sso.success');
  }, 30_000);

  it('rejects a tampered assertion (signature mismatch)', async () => {
    const idp = createSamlTestIdp({ entityId: 'https://idp.live.test/saml/idp' });

    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue({
      id: 'idp-saml-2',
      institutionId: 'inst-saml-2',
      protocol: 'SAML',
      enabled: true,
      displayName: 'Sign in with Live SAML',
      samlEntityId: idp.entityId,
      samlSsoUrl: 'https://idp.live.test/saml/sso',
      samlCert: idp.cert,
      oidcIssuer: null,
      oidcClientId: null,
      oidcClientSecret: null,
      jitProvisioning: true,
      defaultRole: 'VIEWER',
      priority: 100,
      institution: {
        id: 'inst-saml-2',
        slug: 'uni-saml-tamper',
        name: 'SAML University',
        subscription: { tier: 'ENTERPRISE' },
      },
    });

    const responseXml = idp.buildSamlResponse({
      spEntityId: getSpEntityId(),
      acsUrl: getSamlAcsUrl('uni-saml-tamper'),
      nameId: TEST_USER_EMAIL,
    });
    // Tamper with the signed payload: swap the legitimate email for an
    // attacker-chosen one. The signature was over the original bytes,
    // so verification must fail.
    const tampered = responseXml.replace(TEST_USER_EMAIL, 'attacker@evil.test');
    const samlResponseB64 = Buffer.from(tampered, 'utf8').toString('base64');

    const app = buildApp();
    const res = await request(app)
      .post('/api/sso/uni-saml-tamper/saml/acs')
      .type('form')
      .send({ SAMLResponse: samlResponseB64, RelayState: 'uni-saml-tamper' });

    // ACS controller returns the opaque `sso_failed` redirect on any
    // validation error — we deliberately don't echo the underlying
    // reason (signature vs audience vs expiry).
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/\/login\?error=sso_failed/);
    // No session token must have been minted.
    expect(res.headers['location']).not.toMatch(/\/login\/sso\?token=/);
  }, 30_000);

  it('rejects an assertion signed by a different IdP keypair', async () => {
    const realIdp = createSamlTestIdp({ entityId: 'https://idp.live.test/saml/idp' });
    const attackerIdp = createSamlTestIdp({ entityId: 'https://idp.live.test/saml/idp' });

    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue({
      id: 'idp-saml-3',
      institutionId: 'inst-saml-3',
      protocol: 'SAML',
      enabled: true,
      displayName: 'Sign in with Live SAML',
      samlEntityId: realIdp.entityId,
      samlSsoUrl: 'https://idp.live.test/saml/sso',
      samlCert: realIdp.cert, // SP trusts only the real IdP's cert
      oidcIssuer: null,
      oidcClientId: null,
      oidcClientSecret: null,
      jitProvisioning: true,
      defaultRole: 'VIEWER',
      priority: 100,
      institution: {
        id: 'inst-saml-3',
        slug: 'uni-saml-rogue',
        name: 'SAML University',
        subscription: { tier: 'ENTERPRISE' },
      },
    });

    // Attacker generates a valid-looking response signed with a
    // DIFFERENT keypair — same entityID, same shape, but the SP's
    // pinned cert won't validate the signature.
    const responseXml = attackerIdp.buildSamlResponse({
      spEntityId: getSpEntityId(),
      acsUrl: getSamlAcsUrl('uni-saml-rogue'),
      nameId: 'rogue@evil.test',
    });
    const samlResponseB64 = Buffer.from(responseXml, 'utf8').toString('base64');

    const app = buildApp();
    const res = await request(app)
      .post('/api/sso/uni-saml-rogue/saml/acs')
      .type('form')
      .send({ SAMLResponse: samlResponseB64, RelayState: 'uni-saml-rogue' });

    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/\/login\?error=sso_failed/);
  }, 30_000);
});
