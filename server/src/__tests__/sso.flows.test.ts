/**
 * Phase 10.10: SAML + OIDC auth flows.
 *
 * Pins the contract:
 *   - Login dispatch redirects to the IdP-side URL (SAML AuthnRequest
 *     or OIDC authorize) for an Enterprise-tier institution with an
 *     enabled IdP row.
 *   - Q7 tier-gating: non-Enterprise institutions return the same
 *     opaque 404 SSO_NOT_CONFIGURED used for "no row" / "disabled".
 *   - SAML ACS verifies the assertion (mocked node-saml), then mints a
 *     session JWT and 302s to FRONTEND_URL/login/sso?token=...
 *   - OIDC callback validates state + code, then mints a session JWT.
 *   - Q3 account collision: existing user with the asserted email gets
 *     `passwordLoginDisabled = true` and an `auth.sso.account_linked`
 *     audit row.
 *   - JIT provisioning: unknown email + jitProvisioning=true creates a
 *     User row with the IdP's defaultRole.
 *   - Q10 MFA bypass: SSO mints a session JWT directly even when the
 *     User has mfaEnabledAt set; no challenge token, no MFA step.
 *   - Q4 lockout bypass: SSO failures don't touch lib/lockout.
 *   - SP metadata XML is served unsigned at /api/sso/sp-metadata.xml.
 *   - Auth login refuses passwordLoginDisabled accounts with the
 *     generic 401 (no info leak).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// node-saml: mock the SAML class + the standalone metadata helper.
const samlInstance = vi.hoisted(() => ({
  getAuthorizeUrlAsync: vi.fn(),
  validatePostResponseAsync: vi.fn(),
}));
vi.mock('@node-saml/node-saml', () => ({
  // node-saml's SAML is a class; `new SAML(config)` is invoked in the
  // helper. Arrow functions can't be constructors — use a regular
  // function expression that returns our shared mock instance.
  SAML: vi.fn(function (this: object) {
    return samlInstance;
  }) as unknown as new (...args: unknown[]) => typeof samlInstance,
  ValidateInResponseTo: { never: 'never', ifPresent: 'ifPresent', always: 'always' },
  generateServiceProviderMetadata: vi.fn(
    () => '<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"/>',
  ),
}));

// openid-client v6: mock the flat functional API.
const oidcMock = vi.hoisted(() => ({
  discovery: vi.fn(),
  randomPKCECodeVerifier: vi.fn(() => 'verifier-test'),
  calculatePKCECodeChallenge: vi.fn(async () => 'challenge-test'),
  randomState: vi.fn(() => 'state-test'),
  randomNonce: vi.fn(() => 'nonce-test'),
  buildAuthorizationUrl: vi.fn(),
  authorizationCodeGrant: vi.fn(),
}));
vi.mock('openid-client', () => oidcMock);

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

const { bcryptCompare } = vi.hoisted(() => ({ bcryptCompare: vi.fn() }));
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'h'), compare: bcryptCompare },
  hash: vi.fn(async () => 'h'),
  compare: bcryptCompare,
}));

import ssoRouter from '../api/sso/sso.router';
import authRouter from '../api/auth/auth.router';
import { errorHandler } from '../middleware/errorHandler';
import { requestId } from '../middleware/requestId';
import { __resetFlowStoreForTests, putFlowState } from '../api/sso/flow-store';
import { __resetLockoutForTests } from '../lib/lockout';
import { encryptSecret, _resetCipherKeyCache } from '../lib/secret-cipher';
import {
  __resetOidcConfigCacheForTests,
  buildOidcAuthorizeUrl,
  invalidateOidcConfigCacheByKey,
} from '../api/sso/oidc';

const SECRET = process.env['JWT_SECRET'] ?? 'test-jwt-secret-do-not-use-in-prod';

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/sso', ssoRouter);
  app.use('/api/auth', authRouter);
  app.use(errorHandler);
  return app;
}

// Loosely typed factory — Prisma-row-shaped, but TypeScript would
// otherwise infer literal types for the null fields and refuse the
// OIDC variant's overrides. The runtime shape is what the controller
// reads, not the inferred type.
//
// Phase 11.13 — `resolveSsoForFlow` now uses `ssoIdentityProvider.findFirst`,
// so the mock returns a single IdP row with the institution nested inside
// (matching the Prisma `include: { institution: { include: { subscription } } }`
// shape). The `FakeIdpWithInstitution` type mirrors that shape.
type FakeIdpWithInstitution = {
  id: string;
  institutionId: string;
  protocol: string;
  enabled: boolean;
  displayName: string;
  samlEntityId: string | null;
  samlSsoUrl: string | null;
  samlCert: string | null;
  oidcIssuer: string | null;
  oidcClientId: string | null;
  oidcClientSecret: string | null;
  jitProvisioning: boolean;
  defaultRole: string;
  priority: number;
  institution: {
    id: string;
    slug: string;
    name: string;
    subscription: { tier: string } | null;
  };
};

// Legacy type still used for `listEnabledIdpsForSlug` discovery mocks.
type _FakeInstitutionRow = {
  ssoProviders: Array<{
    id: string;
    enabled: boolean;
    protocol: string;
    displayName: string;
    priority: number;
  }>;
};

function enterpriseSamlIdpFixture(): FakeIdpWithInstitution {
  return {
    id: 'idp-1',
    institutionId: 'inst-1',
    protocol: 'SAML',
    enabled: true,
    displayName: 'Sign in with University One',
    samlEntityId: 'https://idp.uni.test/saml',
    samlSsoUrl: 'https://idp.uni.test/saml/sso',
    samlCert: '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----',
    oidcIssuer: null,
    oidcClientId: null,
    oidcClientSecret: null,
    jitProvisioning: true,
    defaultRole: 'VIEWER',
    priority: 100,
    institution: {
      id: 'inst-1',
      slug: 'uni-1',
      name: 'University One',
      subscription: { tier: 'ENTERPRISE' },
    },
  };
}

function enterpriseOidcIdpFixture(): FakeIdpWithInstitution {
  return {
    id: 'idp-1',
    institutionId: 'inst-1',
    protocol: 'OIDC',
    enabled: true,
    displayName: 'Sign in with University One',
    samlEntityId: null,
    samlSsoUrl: null,
    samlCert: null,
    oidcIssuer: 'https://idp.uni.test',
    oidcClientId: 'client-1',
    oidcClientSecret: 'secret-1',
    jitProvisioning: true,
    defaultRole: 'VIEWER',
    priority: 100,
    institution: {
      id: 'inst-1',
      slug: 'uni-1',
      name: 'University One',
      subscription: { tier: 'ENTERPRISE' },
    },
  };
}

type AuditCall = [{ data: { action: string; changes?: Record<string, unknown> } }];
function auditActions(): string[] {
  return (prismaMock.auditLog.create.mock.calls as unknown as AuditCall[]).map(
    (c) => c[0].data.action,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
  __resetFlowStoreForTests();
  __resetLockoutForTests();
});

// ── Q7: tier-gating ────────────────────────────────────────────────────────

describe('SSO tier-gating (Q7 — Enterprise only)', () => {
  it('rejects an institution on FREE tier with the same opaque 404 used for "no row"', async () => {
    const idp = enterpriseSamlIdpFixture();
    idp.institution.subscription = { tier: 'FREE' };
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(idp);

    const res = await request(buildApp()).get('/api/sso/uni-1/login');
    // Express error handler doesn't redirect on AppError — it returns
    // the JSON envelope. Acceptable for v1; the frontend treats any
    // non-2xx from /login as "fall back to password".
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SSO_NOT_CONFIGURED');
  });

  it('rejects PROFESSIONAL tier the same way', async () => {
    const idp = enterpriseSamlIdpFixture();
    idp.institution.subscription = { tier: 'PROFESSIONAL' };
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(idp);

    const res = await request(buildApp()).get('/api/sso/uni-1/login');
    expect(res.status).toBe(404);
  });
});

// ── Login dispatch ─────────────────────────────────────────────────────────

describe('GET /api/sso/:slug/login', () => {
  it('SAML — 302s to the AuthnRequest URL', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(enterpriseSamlIdpFixture());
    samlInstance.getAuthorizeUrlAsync.mockResolvedValueOnce(
      'https://idp.uni.test/saml/sso?SAMLRequest=base64encoded&RelayState=uni-1',
    );

    const res = await request(buildApp()).get('/api/sso/uni-1/login');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toContain('https://idp.uni.test/saml/sso?');
  });

  it('OIDC — 302s to the authorize URL with state + PKCE', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(enterpriseOidcIdpFixture());
    oidcMock.discovery.mockResolvedValueOnce({} as unknown);
    oidcMock.buildAuthorizationUrl.mockReturnValueOnce(
      new URL('https://idp.uni.test/authorize?state=state-test&code_challenge=challenge-test'),
    );

    const res = await request(buildApp()).get('/api/sso/uni-1/login');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toContain('state=state-test');
  });

  it('SAML — embeds idpId in RelayState when ?idpId= is supplied (multi-IdP threading)', async () => {
    // When a specific IdP is requested, the RelayState must carry
    // `<slug>:<idpId>` so the ACS can re-load the same row and validate
    // with its cert — not the primary IdP's cert.
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(enterpriseSamlIdpFixture());
    samlInstance.getAuthorizeUrlAsync.mockResolvedValueOnce(
      'https://idp.uni.test/saml/sso?SAMLRequest=base64encoded',
    );

    const res = await request(buildApp()).get('/api/sso/uni-1/login?idpId=idp-1');
    expect(res.status).toBe(302);

    // getAuthorizeUrlAsync is called with (relayState, host, options).
    const relayState = samlInstance.getAuthorizeUrlAsync.mock.calls[0]?.[0];
    expect(relayState).toBe('uni-1:idp-1');
  });
});

// ── SAML ACS ───────────────────────────────────────────────────────────────

describe('POST /api/sso/:slug/saml/acs', () => {
  it('verifies the assertion, JIT-provisions a new user, and 302s to the frontend with a token', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(enterpriseSamlIdpFixture());
    prismaMock.user.findUnique.mockResolvedValue(null); // unknown email
    prismaMock.user.create.mockResolvedValue({
      id: 'u-new',
      email: 'new@uni.test',
      name: 'New User',
      role: 'VIEWER',
      institutionId: 'inst-1',
      mfaEnabledAt: null,
      institution: { id: 'inst-1', name: 'University One', subscription: { tier: 'ENTERPRISE' } },
    });
    samlInstance.validatePostResponseAsync.mockResolvedValueOnce({
      profile: {
        nameID: 'new@uni.test',
        attributes: { displayName: 'New User' },
      },
      loggedOut: false,
    });

    const res = await request(buildApp())
      .post('/api/sso/uni-1/saml/acs')
      .type('form')
      .send({ SAMLResponse: 'base64encoded', RelayState: 'uni-1' });

    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/\/login\/sso\?token=/);
    // Token from URL should be a valid HERM JWT representing the new user.
    const tokenMatch = /token=([^&]+)/.exec(res.headers['location']);
    expect(tokenMatch).toBeTruthy();
    const decoded = jwt.verify(decodeURIComponent(tokenMatch![1]!), SECRET) as {
      userId: string;
      email: string;
    };
    expect(decoded.userId).toBe('u-new');
    expect(decoded.email).toBe('new@uni.test');

    // JIT provisioning audit row.
    const actions = auditActions();
    expect(actions).toContain('auth.sso.jit_provisioned');
    expect(actions).toContain('auth.sso.success');
  });

  it('redirects to /login?error=sso_failed when the assertion is invalid', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(enterpriseSamlIdpFixture());
    samlInstance.validatePostResponseAsync.mockRejectedValueOnce(new Error('Invalid signature'));

    const res = await request(buildApp())
      .post('/api/sso/uni-1/saml/acs')
      .type('form')
      .send({ SAMLResponse: 'tampered', RelayState: 'uni-1' });

    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/\/login\?error=sso_failed/);
    // Failure audited without echoing the underlying error message.
    const actions = auditActions();
    expect(actions).toContain('auth.sso.fail');
  });

  it('uses the cert from the IdP encoded in RelayState (multi-IdP correctness)', async () => {
    // When RelayState carries `<slug>:<idpId>`, the ACS must resolve that
    // specific IdP row — not the primary — so validation uses the right cert.
    // Without this, a multi-SAML tenant's secondary IdP would always fail
    // signature verification against the primary's cert.
    const { SAML } = await import('@node-saml/node-saml');
    const samlCtor = SAML as unknown as ReturnType<typeof vi.fn>;
    samlCtor.mockClear();

    const IDP2_CERT = '-----BEGIN CERTIFICATE-----\nMIIB-idp2...\n-----END CERTIFICATE-----';
    const idp = enterpriseSamlIdpFixture();
    idp.id = 'idp-2';
    idp.samlCert = IDP2_CERT;

    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(idp);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'u-idp2',
      email: 'user@uni.test',
      name: 'User',
      role: 'VIEWER',
      institutionId: 'inst-1',
      mfaEnabledAt: null,
      institution: { id: 'inst-1', name: 'University One', subscription: { tier: 'ENTERPRISE' } },
    });
    samlInstance.validatePostResponseAsync.mockResolvedValueOnce({
      profile: { nameID: 'user@uni.test', attributes: {} },
      loggedOut: false,
    });

    const res = await request(buildApp())
      .post('/api/sso/uni-1/saml/acs')
      .type('form')
      .send({ SAMLResponse: 'base64encoded', RelayState: 'uni-1:idp-2' });

    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/\/login\/sso\?token=/);

    // The SAML validator must have been initialized with idp-2's cert.
    const config = samlCtor.mock.calls[0]?.[0] as { idpCert: string } | undefined;
    expect(config?.idpCert).toBe(IDP2_CERT);
  });
});

// ── Q3: account collision ──────────────────────────────────────────────────

describe('Q3 account collision — existing password user signs in via SSO', () => {
  it('flips passwordLoginDisabled to true and audits auth.sso.account_linked', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(enterpriseSamlIdpFixture());
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-existing',
      email: 'existing@uni.test',
      name: 'Existing',
      role: 'INSTITUTION_ADMIN',
      institutionId: 'inst-1',
      passwordLoginDisabled: false,
      mfaEnabledAt: null,
      institution: { id: 'inst-1', name: 'University One', subscription: { tier: 'ENTERPRISE' } },
    });
    prismaMock.user.update.mockResolvedValue({});
    samlInstance.validatePostResponseAsync.mockResolvedValueOnce({
      profile: { nameID: 'existing@uni.test', attributes: {} },
      loggedOut: false,
    });

    const res = await request(buildApp())
      .post('/api/sso/uni-1/saml/acs')
      .type('form')
      .send({ SAMLResponse: 'b64', RelayState: 'uni-1' });

    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/\/login\/sso\?token=/);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u-existing' },
      data: { passwordLoginDisabled: true },
    });
    const actions = auditActions();
    expect(actions).toContain('auth.sso.account_linked');
  });

  it('does NOT audit account_linked twice on subsequent logins (idempotent)', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(enterpriseSamlIdpFixture());
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-existing',
      email: 'existing@uni.test',
      name: 'Existing',
      role: 'INSTITUTION_ADMIN',
      institutionId: 'inst-1',
      passwordLoginDisabled: true, // already linked
      mfaEnabledAt: null,
      institution: { id: 'inst-1', name: 'University One', subscription: { tier: 'ENTERPRISE' } },
    });
    samlInstance.validatePostResponseAsync.mockResolvedValueOnce({
      profile: { nameID: 'existing@uni.test', attributes: {} },
      loggedOut: false,
    });

    await request(buildApp())
      .post('/api/sso/uni-1/saml/acs')
      .type('form')
      .send({ SAMLResponse: 'b64', RelayState: 'uni-1' });

    expect(prismaMock.user.update).not.toHaveBeenCalled();
    const actions = auditActions();
    expect(actions).not.toContain('auth.sso.account_linked');
    expect(actions).toContain('auth.sso.success');
  });
});

// ── Cross-institution rejection (Bugbot HIGH severity follow-up) ──────────

describe('Cross-institution SSO is REFUSED — no account takeover via email', () => {
  it('rejects when the asserted email belongs to a User in a different institution', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(enterpriseSamlIdpFixture());
    // Existing user lives in a DIFFERENT institution from the asserting IdP.
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-other-tenant',
      email: 'admin@other-tenant.test',
      name: 'Other Tenant Admin',
      role: 'INSTITUTION_ADMIN',
      institutionId: 'inst-OTHER',
      passwordLoginDisabled: false,
      mfaEnabledAt: null,
      institution: { id: 'inst-OTHER', name: 'Other Tenant', subscription: { tier: 'ENTERPRISE' } },
    });
    samlInstance.validatePostResponseAsync.mockResolvedValueOnce({
      profile: { nameID: 'admin@other-tenant.test', attributes: {} },
      loggedOut: false,
    });

    const res = await request(buildApp())
      .post('/api/sso/uni-1/saml/acs')
      .type('form')
      .send({ SAMLResponse: 'b64', RelayState: 'uni-1' });

    // Failure path → /login?error=sso_failed (the controller catches the
    // AppError thrown from completeSsoSignIn and surfaces it via the
    // global error handler, NOT via failureRedirect. So we expect the
    // JSON 403 envelope here, not a redirect.)
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');

    // Critically: NO update, NO session-mint, audit recorded.
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    const actions = auditActions();
    expect(actions).toContain('auth.sso.cross_institution_blocked');
    expect(actions).not.toContain('auth.sso.account_linked');
    expect(actions).not.toContain('auth.sso.success');
  });
});

// ── Q10: MFA bypass ────────────────────────────────────────────────────────

describe('Q10 MFA bypass — SSO mints a session even when user has mfaEnabledAt', () => {
  it('returns a normal session JWT (no challenge), audits mfaBypassed', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(enterpriseSamlIdpFixture());
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-mfa',
      email: 'mfa@uni.test',
      name: 'MFA User',
      role: 'VIEWER',
      institutionId: 'inst-1',
      passwordLoginDisabled: true,
      mfaEnabledAt: new Date('2026-01-01'), // MFA enrolled
      mfaSecret: 'AAA',
      institution: { id: 'inst-1', name: 'University One', subscription: { tier: 'ENTERPRISE' } },
    });
    samlInstance.validatePostResponseAsync.mockResolvedValueOnce({
      profile: { nameID: 'mfa@uni.test', attributes: {} },
      loggedOut: false,
    });

    const res = await request(buildApp())
      .post('/api/sso/uni-1/saml/acs')
      .type('form')
      .send({ SAMLResponse: 'b64', RelayState: 'uni-1' });

    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/\/login\/sso\?token=/);
    // The minted token must NOT carry the MFA challenge purpose.
    const tokenMatch = /token=([^&]+)/.exec(res.headers['location']);
    const decoded = jwt.verify(decodeURIComponent(tokenMatch![1]!), SECRET) as { purpose?: string };
    expect(decoded.purpose).toBeUndefined();

    const successCall = (prismaMock.auditLog.create.mock.calls as unknown as AuditCall[]).find(
      (c) => c[0].data.action === 'auth.sso.success',
    );
    expect(successCall?.[0].data.changes).toEqual(expect.objectContaining({ mfaBypassed: true }));
  });
});

// ── OIDC callback ──────────────────────────────────────────────────────────

describe('GET /api/sso/:slug/oidc/callback', () => {
  it('exchanges code for tokens, JIT-provisions, and 302s with a session token', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(enterpriseOidcIdpFixture());
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'u-oidc',
      email: 'oidc@uni.test',
      name: 'OIDC User',
      role: 'VIEWER',
      institutionId: 'inst-1',
      mfaEnabledAt: null,
      institution: { id: 'inst-1', name: 'University One', subscription: { tier: 'ENTERPRISE' } },
    });

    // Pre-populate the flow store so the callback can match state.
    await putFlowState('state-cb', {
      slug: 'uni-1',
      codeVerifier: 'verifier-cb',
      nonce: 'nonce-cb',
    });

    oidcMock.discovery.mockResolvedValueOnce({} as unknown);
    oidcMock.authorizationCodeGrant.mockResolvedValueOnce({
      claims: () => ({ email: 'oidc@uni.test', name: 'OIDC User', sub: 'sub-1' }),
    });

    const res = await request(buildApp()).get(
      '/api/sso/uni-1/oidc/callback?state=state-cb&code=code-1',
    );
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/\/login\/sso\?token=/);
  });

  it('rejects when state is unknown or already consumed', async () => {
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(enterpriseOidcIdpFixture());

    const res = await request(buildApp()).get('/api/sso/uni-1/oidc/callback?state=unknown');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/\/login\?error=sso_failed/);
  });
});

// ── At-rest envelope encryption (Phase 11.2) ───────────────────────────────

describe('SSO secret-at-rest encryption', () => {
  // Deterministic low-entropy test keys — NOT secrets. Repeating-byte form
  // avoids tripping secret scanners (GitGuardian etc.) on a 64-hex literal.
  const TEST_KEY_HEX = '42'.repeat(32);
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env['SSO_SECRET_KEY'];
    process.env['SSO_SECRET_KEY'] = TEST_KEY_HEX;
    _resetCipherKeyCache();
    // The OIDC config cache is keyed by issuer URL and would otherwise
    // short-circuit `oidc.discovery` for the second+ test that hits the
    // same issuer. Reset it so each call asserts the secret it sees.
    __resetOidcConfigCacheForTests();
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env['SSO_SECRET_KEY'];
    else process.env['SSO_SECRET_KEY'] = originalKey;
    _resetCipherKeyCache();
  });

  it('decrypts oidcClientSecret before passing it to openid-client.discovery', async () => {
    const idp = enterpriseOidcIdpFixture();
    const plaintextSecret = idp.oidcClientSecret as string;
    idp.oidcClientSecret = encryptSecret(plaintextSecret);
    expect(idp.oidcClientSecret!.startsWith('enc:v1:')).toBe(true);

    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(idp);
    oidcMock.discovery.mockResolvedValueOnce({} as unknown);
    oidcMock.buildAuthorizationUrl.mockReturnValueOnce(
      new URL('https://idp.uni.test/authorize?state=state-test'),
    );

    const res = await request(buildApp()).get('/api/sso/uni-1/login');
    expect(res.status).toBe(302);
    // The third positional argument to openid-client.discovery is the
    // client secret; it must be the plaintext, not the enc:v1: blob.
    expect(oidcMock.discovery).toHaveBeenCalled();
    const call = oidcMock.discovery.mock.calls[0] as unknown as [URL, string, string];
    expect(call[2]).toBe(plaintextSecret);
    expect(call[2].startsWith('enc:v1:')).toBe(false);
  });

  it('decrypts samlCert before passing it to node-saml SAML(...)', async () => {
    const { SAML } = await import('@node-saml/node-saml');
    const samlCtor = SAML as unknown as ReturnType<typeof vi.fn>;
    samlCtor.mockClear();

    const idp = enterpriseSamlIdpFixture();
    const plaintextCert = idp.samlCert as string;
    idp.samlCert = encryptSecret(plaintextCert);
    expect(idp.samlCert!.startsWith('enc:v1:')).toBe(true);

    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(idp);
    samlInstance.getAuthorizeUrlAsync.mockResolvedValueOnce(
      'https://idp.uni.test/saml/sso?SAMLRequest=base64',
    );

    const res = await request(buildApp()).get('/api/sso/uni-1/login');
    expect(res.status).toBe(302);
    expect(samlCtor).toHaveBeenCalled();
    const config = samlCtor.mock.calls[0]?.[0] as { idpCert: string } | undefined;
    expect(config?.idpCert).toBe(plaintextCert);
    expect(config?.idpCert?.startsWith('enc:v1:')).toBe(false);
  });

  it('legacy plaintext rows still resolve when SSO_SECRET_KEY is set (back-compat)', async () => {
    // Row written before this PR shipped: oidcClientSecret stored as plaintext.
    const idp = enterpriseOidcIdpFixture();
    const plaintextSecret = idp.oidcClientSecret as string;
    expect(plaintextSecret.startsWith('enc:v1:')).toBe(false);

    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(idp);
    oidcMock.discovery.mockResolvedValueOnce({} as unknown);
    oidcMock.buildAuthorizationUrl.mockReturnValueOnce(
      new URL('https://idp.uni.test/authorize?state=state-test'),
    );

    const res = await request(buildApp()).get('/api/sso/uni-1/login');
    expect(res.status).toBe(302);
    const call = oidcMock.discovery.mock.calls[0] as unknown as [URL, string, string];
    expect(call[2]).toBe(plaintextSecret);
  });

  it('returns the opaque 404 when an encrypted row cannot be decrypted (wrong key)', async () => {
    const idp = enterpriseOidcIdpFixture();
    idp.oidcClientSecret = encryptSecret(idp.oidcClientSecret as string);
    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(idp);

    // Rotate the master key to a different (also-low-entropy, not-a-secret)
    // value so the auth tag fails verification.
    process.env['SSO_SECRET_KEY'] = '99'.repeat(32);
    _resetCipherKeyCache();

    const res = await request(buildApp()).get('/api/sso/uni-1/login');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SSO_NOT_CONFIGURED');
  });
});

// ── SP metadata ────────────────────────────────────────────────────────────

describe('GET /api/sso/sp-metadata.xml', () => {
  it('returns SP metadata XML with the application/xml content type', async () => {
    const res = await request(buildApp()).get('/api/sso/sp-metadata.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.text).toContain('EntityDescriptor');
  });
});

// ── UKAMF SP signing keypair (Phase 11.3) ──────────────────────────────────

describe('SAML SP signing keypair', () => {
  const FAKE_KEY = '-----BEGIN PRIVATE KEY-----\nfake-private-key\n-----END PRIVATE KEY-----';
  const FAKE_CERT = '-----BEGIN CERTIFICATE-----\nfake-certificate\n-----END CERTIFICATE-----';

  let savedKey: string | undefined;
  let savedCert: string | undefined;

  beforeEach(async () => {
    savedKey = process.env['SP_SIGNING_KEY'];
    savedCert = process.env['SP_SIGNING_CERT'];
    delete process.env['SP_SIGNING_KEY'];
    delete process.env['SP_SIGNING_CERT'];
    const { _resetSpSigningCache } = await import('../lib/sp-signing');
    _resetSpSigningCache();
  });

  afterEach(async () => {
    if (savedKey === undefined) delete process.env['SP_SIGNING_KEY'];
    else process.env['SP_SIGNING_KEY'] = savedKey;
    if (savedCert === undefined) delete process.env['SP_SIGNING_CERT'];
    else process.env['SP_SIGNING_CERT'] = savedCert;
    const { _resetSpSigningCache } = await import('../lib/sp-signing');
    _resetSpSigningCache();
  });

  it('AuthnRequest path threads SP keypair into node-saml SamlConfig when configured', async () => {
    process.env['SP_SIGNING_KEY'] = FAKE_KEY;
    process.env['SP_SIGNING_CERT'] = FAKE_CERT;

    const { SAML } = await import('@node-saml/node-saml');
    const samlCtor = SAML as unknown as ReturnType<typeof vi.fn>;
    samlCtor.mockClear();

    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(enterpriseSamlIdpFixture());
    samlInstance.getAuthorizeUrlAsync.mockResolvedValueOnce(
      'https://idp.uni.test/saml/sso?SAMLRequest=base64',
    );

    const res = await request(buildApp()).get('/api/sso/uni-1/login');
    expect(res.status).toBe(302);
    expect(samlCtor).toHaveBeenCalled();
    const config = samlCtor.mock.calls[0]?.[0] as
      | { privateKey?: string; publicCert?: string }
      | undefined;
    expect(config?.privateKey).toBe(FAKE_KEY);
    expect(config?.publicCert).toBe(FAKE_CERT);
  });

  it('AuthnRequest path leaves SamlConfig unsigned when keypair is unset (back-compat)', async () => {
    const { SAML } = await import('@node-saml/node-saml');
    const samlCtor = SAML as unknown as ReturnType<typeof vi.fn>;
    samlCtor.mockClear();

    prismaMock.ssoIdentityProvider.findFirst.mockResolvedValue(enterpriseSamlIdpFixture());
    samlInstance.getAuthorizeUrlAsync.mockResolvedValueOnce(
      'https://idp.uni.test/saml/sso?SAMLRequest=base64',
    );

    await request(buildApp()).get('/api/sso/uni-1/login');
    const config = samlCtor.mock.calls[0]?.[0] as
      | { privateKey?: string; publicCert?: string }
      | undefined;
    expect(config?.privateKey).toBeUndefined();
    expect(config?.publicCert).toBeUndefined();
  });

  it('SP metadata path passes signMetadata + privateKey + publicCerts when keypair is set', async () => {
    process.env['SP_SIGNING_KEY'] = FAKE_KEY;
    process.env['SP_SIGNING_CERT'] = FAKE_CERT;

    const { generateServiceProviderMetadata } = await import('@node-saml/node-saml');
    const metaFn = generateServiceProviderMetadata as unknown as ReturnType<typeof vi.fn>;
    metaFn.mockClear();
    metaFn.mockReturnValueOnce(
      '<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"><Signature/></EntityDescriptor>',
    );

    const res = await request(buildApp()).get('/api/sso/sp-metadata.xml');
    expect(res.status).toBe(200);
    expect(metaFn).toHaveBeenCalled();
    const params = metaFn.mock.calls[0]?.[0] as
      | { signMetadata?: boolean; privateKey?: string; publicCerts?: string[] }
      | undefined;
    expect(params?.signMetadata).toBe(true);
    expect(params?.privateKey).toBe(FAKE_KEY);
    expect(params?.publicCerts).toEqual([FAKE_CERT]);
  });

  it('SP metadata path omits signMetadata when keypair is unset (back-compat)', async () => {
    const { generateServiceProviderMetadata } = await import('@node-saml/node-saml');
    const metaFn = generateServiceProviderMetadata as unknown as ReturnType<typeof vi.fn>;
    metaFn.mockClear();
    metaFn.mockReturnValueOnce('<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"/>');

    await request(buildApp()).get('/api/sso/sp-metadata.xml');
    const params = metaFn.mock.calls[0]?.[0] as
      | { signMetadata?: boolean; privateKey?: string }
      | undefined;
    expect(params?.signMetadata).toBeUndefined();
    expect(params?.privateKey).toBeUndefined();
  });
});

// ── Discovery: email-based ─────────────────────────────────────────────────

describe('GET /api/sso/discover?email=', () => {
  it('resolves Institution by domain and returns the SSO config', async () => {
    // Phase 11.13 — discoverByEmail now does two reads: findFirst by
    // domain (for the slug) then findUnique by slug (for the
    // ssoProviders array, via listEnabledIdpsForSlug).
    prismaMock.institution.findFirst.mockResolvedValue({ slug: 'uni-1' });
    prismaMock.institution.findUnique.mockResolvedValue({
      ssoProviders: [
        {
          id: 'idp-1',
          enabled: true,
          protocol: 'SAML',
          displayName: 'Sign in with University One',
          priority: 100,
        },
      ],
    });

    const res = await request(buildApp()).get('/api/sso/discover?email=jane@uni.test');
    expect(res.status).toBe(200);
    expect(res.body.data.institutionSlug).toBe('uni-1');
    expect(res.body.data.protocol).toBe('SAML');
    expect(res.body.data.displayName).toBe('Sign in with University One');
    expect(res.body.data.loginUrl).toBe('/api/sso/uni-1/login');
    expect(res.body.data.options).toHaveLength(1);
  });

  it('returns 404 SSO_NOT_CONFIGURED when the domain has no IdP', async () => {
    prismaMock.institution.findFirst.mockResolvedValue(null);
    const res = await request(buildApp()).get('/api/sso/discover?email=foo@unknown.test');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SSO_NOT_CONFIGURED');
  });

  it('rejects malformed email with 400', async () => {
    const res = await request(buildApp()).get('/api/sso/discover?email=notanemail');
    expect(res.status).toBe(400);
  });
});

// ── Q3: password login refused once linked ─────────────────────────────────

describe('POST /api/auth/login refuses passwordLoginDisabled accounts', () => {
  it('returns the same generic 401 — no info leak', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u-linked',
      email: 'linked@uni.test',
      name: 'Linked',
      role: 'VIEWER',
      passwordHash: '$2a$10$abcd',
      passwordLoginDisabled: true,
      institutionId: 'inst-1',
      mfaEnabledAt: null,
      institution: { id: 'inst-1', name: 'University One', subscription: { tier: 'ENTERPRISE' } },
    });
    bcryptCompare.mockResolvedValue(true); // even with the right password

    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'linked@uni.test', password: 'whatever' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    expect(res.body.error.message).toBe('Invalid email or password');
  });
});

// ── P11: invalidateOidcConfigCacheByKey ────────────────────────────────────
//
// Phase 11.15 (P11) — write-side invalidation hook for the admin SSO upsert
// path. The cached `Configuration` object embeds the `clientSecret` it was
// discovered with, so a secret rotation that doesn't kick the cache leaves
// token exchange using the stale secret for up to TTL_MS (1h). These tests
// pin the contract: a populated entry can be removed in O(1), and the next
// `getConfig` call re-runs `oidc.discovery` rather than serving stale data.

describe('invalidateOidcConfigCacheByKey', () => {
  beforeEach(() => {
    __resetOidcConfigCacheForTests();
    oidcMock.discovery.mockReset();
    oidcMock.buildAuthorizationUrl.mockReset();
  });

  it('returns false when issuer or clientId is missing (no cache entry can exist)', () => {
    expect(invalidateOidcConfigCacheByKey({ oidcIssuer: null, oidcClientId: 'c' })).toBe(false);
    expect(invalidateOidcConfigCacheByKey({ oidcIssuer: 'https://i', oidcClientId: null })).toBe(
      false,
    );
    expect(invalidateOidcConfigCacheByKey({ oidcIssuer: undefined, oidcClientId: undefined })).toBe(
      false,
    );
  });

  it('returns false when the key has no entry in the cache (idempotent)', () => {
    expect(
      invalidateOidcConfigCacheByKey({
        oidcIssuer: 'https://idp.uni.test',
        oidcClientId: 'never-cached',
      }),
    ).toBe(false);
  });

  it('removes the entry from the cache for {issuer, clientId} populated by getConfig', async () => {
    // Populate the cache via the public surface (buildOidcAuthorizeUrl
    // calls getConfig internally). Then invalidate. Then call again and
    // assert discovery was hit twice — proving the entry was actually
    // dropped, not just shadowed by a TTL miss.
    oidcMock.discovery.mockResolvedValue({} as unknown);
    oidcMock.buildAuthorizationUrl.mockReturnValue(
      new URL('https://idp.uni.test/authorize?state=state-test'),
    );

    await buildOidcAuthorizeUrl('uni-1', {
      oidcIssuer: 'https://idp.uni.test',
      oidcClientId: 'client-abc',
      oidcClientSecret: 'old-secret',
    });
    expect(oidcMock.discovery).toHaveBeenCalledTimes(1);

    // Sanity: a second call without invalidation hits the cache (no
    // discovery re-fetch).
    await buildOidcAuthorizeUrl('uni-1', {
      oidcIssuer: 'https://idp.uni.test',
      oidcClientId: 'client-abc',
      oidcClientSecret: 'old-secret',
    });
    expect(oidcMock.discovery).toHaveBeenCalledTimes(1);

    const removed = invalidateOidcConfigCacheByKey({
      oidcIssuer: 'https://idp.uni.test',
      oidcClientId: 'client-abc',
    });
    expect(removed).toBe(true);

    // After invalidation, getConfig must re-run discovery — and pass
    // the NEW secret on the wire, since the cached Configuration is gone.
    await buildOidcAuthorizeUrl('uni-1', {
      oidcIssuer: 'https://idp.uni.test',
      oidcClientId: 'client-abc',
      oidcClientSecret: 'rotated-secret',
    });
    expect(oidcMock.discovery).toHaveBeenCalledTimes(2);
    const lastCall = oidcMock.discovery.mock.calls[1] as unknown as [URL, string, string];
    expect(lastCall[2]).toBe('rotated-secret');
  });

  it('only removes the targeted entry — other {issuer, clientId} pairs are untouched', async () => {
    oidcMock.discovery.mockResolvedValue({} as unknown);
    oidcMock.buildAuthorizationUrl.mockReturnValue(
      new URL('https://idp.uni.test/authorize?state=state-test'),
    );

    // Populate two distinct entries (same issuer, different clientId —
    // matches the two-Entra-apps scenario from PR #77).
    await buildOidcAuthorizeUrl('uni-1', {
      oidcIssuer: 'https://idp.uni.test',
      oidcClientId: 'client-A',
      oidcClientSecret: 'secret-A',
    });
    await buildOidcAuthorizeUrl('uni-1', {
      oidcIssuer: 'https://idp.uni.test',
      oidcClientId: 'client-B',
      oidcClientSecret: 'secret-B',
    });
    expect(oidcMock.discovery).toHaveBeenCalledTimes(2);

    // Invalidate only A. B must remain a cache hit.
    expect(
      invalidateOidcConfigCacheByKey({
        oidcIssuer: 'https://idp.uni.test',
        oidcClientId: 'client-A',
      }),
    ).toBe(true);

    await buildOidcAuthorizeUrl('uni-1', {
      oidcIssuer: 'https://idp.uni.test',
      oidcClientId: 'client-B',
      oidcClientSecret: 'secret-B',
    });
    // Still 2 — B was a cache hit, not a re-discovery.
    expect(oidcMock.discovery).toHaveBeenCalledTimes(2);

    // A is now a miss → re-discovery.
    await buildOidcAuthorizeUrl('uni-1', {
      oidcIssuer: 'https://idp.uni.test',
      oidcClientId: 'client-A',
      oidcClientSecret: 'secret-A',
    });
    expect(oidcMock.discovery).toHaveBeenCalledTimes(3);
  });
});
