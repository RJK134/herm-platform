/**
 * Phase 11.12 — SAML Single Logout integration tests.
 *
 * Exercises the IdP-initiated SLO endpoint (`GET /api/sso/:slug/saml/slo`)
 * end-to-end with mocked node-saml and a mocked Prisma. Covers:
 *   - Happy path: signed LogoutRequest → revokeBySamlSubject → 302 to
 *     `/login?logged_out=sso`, audit `auth.sso.slo_success` with
 *     revoked count.
 *   - Validation failure: invalid signature / NameID → 302 to
 *     `/login?error=sso_failed`, audit `auth.sso.slo_fail`.
 *   - Tier-gating: non-Enterprise institution returns the same opaque
 *     404 (delegated to resolveSsoForFlow).
 *
 * Also covers the auth.logout endpoint's session-store revocation.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const samlInstance = vi.hoisted(() => ({
  validateRedirectAsync: vi.fn(),
  getAuthorizeUrlAsync: vi.fn(),
  validatePostResponseAsync: vi.fn(),
}));
vi.mock('@node-saml/node-saml', () => ({
  SAML: vi.fn(function () {
    return samlInstance;
  }),
  generateServiceProviderMetadata: vi.fn(() => '<EntityDescriptor/>'),
  ValidateInResponseTo: { never: 'never' },
}));

const { findUniqueMock, ssoFindUniqueMock, ssoFindFirstMock, auditCreateMock, userFindUniqueMock } =
  vi.hoisted(() => ({
    findUniqueMock: vi.fn(),
    ssoFindUniqueMock: vi.fn(),
    // Phase 11.13 follow-up — `resolveSsoForFlow` now reads the IdP via
    // `ssoIdentityProvider.findFirst` directly. Tests need to mock that
    // alongside the legacy `institution.findUnique` (still used for
    // discovery via `listEnabledIdpsForSlug`).
    ssoFindFirstMock: vi.fn(),
    auditCreateMock: vi.fn(),
    userFindUniqueMock: vi.fn(),
  }));
vi.mock('../utils/prisma', () => ({
  default: {
    institution: { findUnique: findUniqueMock },
    ssoIdentityProvider: { findUnique: ssoFindUniqueMock, findFirst: ssoFindFirstMock },
    auditLog: { create: auditCreateMock },
    user: { findUnique: userFindUniqueMock },
  },
}));

const { revokeBySamlSubjectMock, recordSessionMock, revokeSessionMock, isRevokedMock } = vi.hoisted(
  () => ({
    revokeBySamlSubjectMock: vi.fn(),
    recordSessionMock: vi.fn(),
    revokeSessionMock: vi.fn(),
    isRevokedMock: vi.fn(),
  }),
);
vi.mock('../lib/session-store', () => ({
  revokeBySamlSubject: revokeBySamlSubjectMock,
  recordSession: recordSessionMock,
  revokeSession: revokeSessionMock,
  isRevoked: isRevokedMock,
  isRevokedSync: vi.fn(() => false),
  _resetSessionStoreForTests: vi.fn(),
}));

import type { Request, Response } from 'express';
import ssoRouter from '../api/sso/sso.router';
import authRouter from '../api/auth/auth.router';
import { errorHandler } from '../middleware/errorHandler';
import { optionalJWT } from '../middleware/auth';
import { __resetSloReplayCacheForTests } from '../api/sso/slo-replay-cache';

// `vitest.config.ts` sets `fileParallelism: false`, so a module-scope
// mutation of `process.env` would leak into later test files. Use
// `vi.stubEnv` so the harness restores the originals on teardown.
vi.stubEnv(
  'JWT_SECRET',
  process.env['JWT_SECRET'] ?? 'test-secret-must-be-long-enough-for-the-jwt-lib',
);
vi.stubEnv('SP_BASE_URL', 'https://herm.test');
vi.stubEnv('FRONTEND_URL', 'https://app.herm.test');

const ENTERPRISE_INSTITUTION = {
  id: 'inst-acme',
  slug: 'acme',
  name: 'Acme University',
  domain: 'acme.test',
  subscription: { tier: 'ENTERPRISE' },
};

// Phase 11.13 follow-up — `resolveSsoForFlow` returns this shape via
// the ssoIdentityProvider.findFirst path: a single IdP row with the
// institution (and its subscription) joined in.
const ENTERPRISE_IDP_ROW = {
  id: 'idp-acme',
  institutionId: 'inst-acme',
  protocol: 'SAML',
  displayName: 'Acme SAML',
  samlEntityId: 'https://idp.acme.test/saml',
  samlSsoUrl: 'https://idp.acme.test/sso',
  samlCert:
    '-----BEGIN CERTIFICATE-----\nMIIDazCCAlOgAwIBAgIUaaaaaaaaaaaaaaaaaaaaaaaa\n-----END CERTIFICATE-----',
  oidcIssuer: null,
  oidcClientId: null,
  oidcClientSecret: null,
  jitProvisioning: true,
  defaultRole: 'VIEWER',
  enabled: true,
  priority: 100,
  createdAt: new Date(),
  updatedAt: new Date(),
  institution: ENTERPRISE_INSTITUTION,
};

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/sso', ssoRouter);
  app.use('/api/auth', authRouter);
  app.use(errorHandler);
  return app;
}

// Restore the original env so a later test file doesn't see leaked
// values. `vi.unstubAllEnvs()` undoes every `vi.stubEnv` from this
// file in one call.
afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  samlInstance.validateRedirectAsync.mockReset();
  findUniqueMock.mockReset();
  ssoFindUniqueMock.mockReset();
  ssoFindFirstMock.mockReset();
  auditCreateMock.mockReset();
  userFindUniqueMock.mockReset();
  revokeBySamlSubjectMock.mockReset();
  recordSessionMock.mockReset();
  revokeSessionMock.mockReset();
  isRevokedMock.mockReset();
  isRevokedMock.mockResolvedValue(false);
  auditCreateMock.mockResolvedValue({});
  recordSessionMock.mockResolvedValue(undefined);
  revokeSessionMock.mockResolvedValue(undefined);
  // Phase 11.15 — clear the SLO replay cache so a `requestId` reused
  // across tests doesn't trip on a stale entry.
  __resetSloReplayCacheForTests();
});

describe('GET /api/sso/:slug/saml/slo (IdP-initiated SLO)', () => {
  it('302s to /login?logged_out=sso, revokes matching sessions, and audits slo_success', async () => {
    // Phase 11.13 — service uses ssoIdentityProvider.findFirst now.
    ssoFindFirstMock.mockResolvedValue(ENTERPRISE_IDP_ROW);
    samlInstance.validateRedirectAsync.mockResolvedValue({
      profile: {
        ID: '_logout-req-1',
        nameID: 'alice@acme.test',
        sessionIndex: 'idx-42',
      },
      loggedOut: true,
    });
    revokeBySamlSubjectMock.mockResolvedValue(2);

    const res = await request(buildApp()).get(
      '/api/sso/acme/saml/slo?SAMLRequest=base64encoded&SigAlg=rsa-sha256&Signature=sigvalue',
    );

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://app.herm.test/login?logged_out=sso');
    expect(revokeBySamlSubjectMock).toHaveBeenCalledWith('inst-acme', 'alice@acme.test', 'idx-42');
    const auditCall = auditCreateMock.mock.calls.find(
      (c) => (c[0]?.data?.action as string) === 'auth.sso.slo_success',
    );
    expect(auditCall).toBeDefined();
    const changes = auditCall?.[0]?.data?.changes as Record<string, unknown>;
    expect(changes['samlNameId']).toBe('alice@acme.test');
    expect(changes['samlSessionIndex']).toBe('idx-42');
    expect(changes['revokedSessionCount']).toBe(2);
  });

  it('302s to /login?error=sso_failed and audits slo_fail when the LogoutRequest signature is bad', async () => {
    ssoFindFirstMock.mockResolvedValue(ENTERPRISE_IDP_ROW);
    samlInstance.validateRedirectAsync.mockRejectedValue(new Error('Invalid signature'));

    const res = await request(buildApp()).get(
      '/api/sso/acme/saml/slo?SAMLRequest=tampered&SigAlg=rsa-sha256&Signature=bad',
    );

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://app.herm.test/login?error=sso_failed');
    expect(revokeBySamlSubjectMock).not.toHaveBeenCalled();
    const auditCall = auditCreateMock.mock.calls.find(
      (c) => (c[0]?.data?.action as string) === 'auth.sso.slo_fail',
    );
    expect(auditCall).toBeDefined();
  });

  it('rejects a replayed LogoutRequest with the same generic SLO failure response (Phase 11.15 H2)', async () => {
    // node-saml verifies the redirect-binding signature on every request
    // but does not consume the `ID`; an attacker who captures one signed
    // SLO redirect would otherwise be able to replay it indefinitely.
    // The replay cache binds (institutionId, requestId) on first sight
    // so a duplicate 302s to /login?error=sso_failed via the SAME path
    // as a signature failure — never echoing "already replayed".
    ssoFindFirstMock.mockResolvedValue(ENTERPRISE_IDP_ROW);
    samlInstance.validateRedirectAsync.mockResolvedValue({
      profile: {
        ID: '_replayed-id',
        nameID: 'alice@acme.test',
        sessionIndex: 'idx-42',
      },
      loggedOut: true,
    });
    revokeBySamlSubjectMock.mockResolvedValue(1);

    // First request — succeeds.
    const first = await request(buildApp()).get(
      '/api/sso/acme/saml/slo?SAMLRequest=base64encoded&SigAlg=rsa-sha256&Signature=sigvalue',
    );
    expect(first.status).toBe(302);
    expect(first.headers.location).toBe('https://app.herm.test/login?logged_out=sso');
    expect(revokeBySamlSubjectMock).toHaveBeenCalledTimes(1);

    // Second (identical) request — replay rejected. Generic failure
    // response is indistinguishable from a signature error.
    const second = await request(buildApp()).get(
      '/api/sso/acme/saml/slo?SAMLRequest=base64encoded&SigAlg=rsa-sha256&Signature=sigvalue',
    );
    expect(second.status).toBe(302);
    expect(second.headers.location).toBe('https://app.herm.test/login?error=sso_failed');
    // No additional revocation issued — replay must not extend the original effect.
    expect(revokeBySamlSubjectMock).toHaveBeenCalledTimes(1);

    const sloFailCall = auditCreateMock.mock.calls.find(
      (c) =>
        (c[0]?.data?.action as string) === 'auth.sso.slo_fail' &&
        (c[0]?.data?.changes as Record<string, unknown>)?.['reason'] === 'replay',
    );
    expect(sloFailCall).toBeDefined();
  });

  it('returns 404 SSO_NOT_CONFIGURED for an unknown institution slug', async () => {
    // findFirst returns null when nothing matches.
    ssoFindFirstMock.mockResolvedValue(null);
    const res = await request(buildApp()).get('/api/sso/unknown/saml/slo?SAMLRequest=x');
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('SSO_NOT_CONFIGURED');
  });

  it('returns 404 SSO_NOT_CONFIGURED for a non-Enterprise tier (Q7 opaque gate)', async () => {
    // The IdP row exists but the institution's subscription tier is
    // below Enterprise — service flattens this to the same opaque 404.
    ssoFindFirstMock.mockResolvedValue({
      ...ENTERPRISE_IDP_ROW,
      institution: { ...ENTERPRISE_INSTITUTION, subscription: { tier: 'PROFESSIONAL' } },
    });
    const res = await request(buildApp()).get('/api/sso/acme/saml/slo?SAMLRequest=x');
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('SSO_NOT_CONFIGURED');
    expect(samlInstance.validateRedirectAsync).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/logout — session revocation', () => {
  it('revokes the current jti through the session store', async () => {
    // Logged-in user with a jti claim — generated as if by `generateToken`
    const token = jwt.sign(
      {
        userId: 'usr-1',
        email: 'user@acme.test',
        name: 'User',
        role: 'VIEWER',
        institutionId: 'inst-acme',
        institutionName: 'Acme',
        tier: 'enterprise',
        jti: 'jti-to-revoke',
      },
      process.env['JWT_SECRET']!,
    );

    const res = await request(buildApp())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(revokeSessionMock).toHaveBeenCalledWith('jti-to-revoke');
  });

  it('does not call revokeSession when the JWT has no jti claim (legacy token)', async () => {
    const token = jwt.sign(
      {
        userId: 'usr-1',
        email: 'user@acme.test',
        name: 'User',
        role: 'VIEWER',
        institutionId: 'inst-acme',
        institutionName: 'Acme',
        tier: 'enterprise',
      },
      process.env['JWT_SECRET']!,
    );

    const res = await request(buildApp())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(revokeSessionMock).not.toHaveBeenCalled();
  });
});

describe('authenticateJWT — revocation check', () => {
  it('rejects a JWT whose jti is in the revocation list', async () => {
    isRevokedMock.mockResolvedValue(true);
    const token = jwt.sign(
      {
        userId: 'usr-1',
        email: 'user@acme.test',
        name: 'User',
        role: 'VIEWER',
        institutionId: 'inst-acme',
        institutionName: 'Acme',
        tier: 'enterprise',
        jti: 'revoked-jti',
      },
      process.env['JWT_SECRET']!,
    );

    const res = await request(buildApp())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(isRevokedMock).toHaveBeenCalledWith('revoked-jti');
  });

  it('skips the revocation check when no jti is present (legacy token)', async () => {
    isRevokedMock.mockResolvedValue(true); // would block if called
    const token = jwt.sign(
      {
        userId: 'usr-1',
        email: 'user@acme.test',
        name: 'User',
        role: 'VIEWER',
        institutionId: 'inst-acme',
        institutionName: 'Acme',
        tier: 'enterprise',
      },
      process.env['JWT_SECRET']!,
    );

    const res = await request(buildApp())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(isRevokedMock).not.toHaveBeenCalled();
  });
});

describe('optionalJWT — revocation check', () => {
  // optionalJWT runs at app level on every /api request. If a revoked
  // JWT slipped through, downstream middleware (rate limiter, tier
  // gate, framework context, role guards layered after optionalJWT)
  // would still see `req.user` populated. SAML SLO would only
  // invalidate the token on `authenticateJWT`-guarded paths, leaving
  // the rest of the app un-revoked — a real defence-in-depth gap
  // (Bugbot finding on PR #74).
  //
  // Tests invoke the middleware directly rather than through the HTTP
  // surface so we exercise the exact code path without coupling to a
  // particular route.
  function makeReq(authHeader?: string): Request {
    return {
      headers: authHeader ? { authorization: authHeader } : {},
      // optionalJWT only reads `headers`; cast covers the rest.
    } as unknown as Request;
  }

  function makeToken(over: Partial<Record<string, unknown>> = {}): string {
    return jwt.sign(
      {
        userId: 'usr-1',
        email: 'user@acme.test',
        name: 'User',
        role: 'VIEWER',
        institutionId: 'inst-acme',
        institutionName: 'Acme',
        tier: 'enterprise',
        ...over,
      },
      process.env['JWT_SECRET']!,
    );
  }

  it('does NOT populate req.user when the bearer jti has been revoked', async () => {
    isRevokedMock.mockResolvedValue(true);
    const req = makeReq(`Bearer ${makeToken({ jti: 'revoked-by-slo' })}`);
    const next = vi.fn();
    await optionalJWT(req, {} as Response, next);
    expect(isRevokedMock).toHaveBeenCalledWith('revoked-by-slo');
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('does populate req.user when the bearer jti is not revoked', async () => {
    isRevokedMock.mockResolvedValue(false);
    const req = makeReq(`Bearer ${makeToken({ jti: 'live-jti' })}`);
    const next = vi.fn();
    await optionalJWT(req, {} as Response, next);
    expect(isRevokedMock).toHaveBeenCalledWith('live-jti');
    expect(req.user).toBeDefined();
    expect(req.user?.userId).toBe('usr-1');
    expect(next).toHaveBeenCalled();
  });

  it('skips the revocation check for a purpose-tagged token (rejected by purpose gate first)', async () => {
    const req = makeReq(`Bearer ${makeToken({ purpose: 'mfa_challenge', jti: 'challenge-jti' })}`);
    const next = vi.fn();
    await optionalJWT(req, {} as Response, next);
    expect(isRevokedMock).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('skips the revocation check for a legacy token without a jti (back-compat)', async () => {
    const req = makeReq(`Bearer ${makeToken()}`);
    const next = vi.fn();
    await optionalJWT(req, {} as Response, next);
    expect(isRevokedMock).not.toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(next).toHaveBeenCalled();
  });

  it('treats a totally invalid JWT as anonymous (no throw)', async () => {
    const req = makeReq('Bearer not-a-jwt');
    const next = vi.fn();
    await optionalJWT(req, {} as Response, next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('passes through unauthenticated requests cleanly', async () => {
    const req = makeReq(undefined);
    const next = vi.fn();
    await optionalJWT(req, {} as Response, next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
    expect(isRevokedMock).not.toHaveBeenCalled();
  });
});
