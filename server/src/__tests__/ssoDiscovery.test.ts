/**
 * Phase 10.7 — SSO discovery (scaffold-only).
 *
 * Pins the contract:
 *   - GET /api/sso/:slug/discover returns 404 with code SSO_NOT_CONFIGURED
 *     when the institution is unknown, has no SsoIdentityProvider row,
 *     or the row is disabled. Same response in all three cases — avoids
 *     leaking "this slug exists" vs "doesn't exist" to an anonymous probe.
 *   - When configured + enabled, returns 200 with { protocol, displayName,
 *     loginUrl } and NO sensitive fields (samlCert, oidcClientSecret etc.).
 *   - The endpoint is anonymous — no Authorization header required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

import { errorHandler } from '../middleware/errorHandler';
import { requestId } from '../middleware/requestId';

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    institution: { findUnique: vi.fn() },
  },
}));
vi.mock('../utils/prisma', () => ({ default: prismaMock }));

import ssoRouter from '../api/sso/sso.router';

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/sso', ssoRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/sso/:institutionSlug/discover', () => {
  // Phase 11.13 — discovery now reads `ssoProviders` (array) via
  // listEnabledIdpsForSlug. Mock that shape: institution row carries
  // `ssoProviders: [...]` instead of `ssoProvider: {...}`.

  it('returns 404 SSO_NOT_CONFIGURED when the institution does not exist', async () => {
    prismaMock.institution.findUnique.mockResolvedValueOnce(null);
    const res = await request(buildApp()).get('/api/sso/unknown-uni/discover');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SSO_NOT_CONFIGURED');
  });

  it('returns 404 SSO_NOT_CONFIGURED when the institution has no SsoIdentityProvider rows', async () => {
    prismaMock.institution.findUnique.mockResolvedValueOnce({
      id: 'inst-1',
      slug: 'no-sso-uni',
      ssoProviders: [],
    });
    const res = await request(buildApp()).get('/api/sso/no-sso-uni/discover');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SSO_NOT_CONFIGURED');
  });

  it('returns 404 SSO_NOT_CONFIGURED when only disabled rows exist (Prisma include filters them out)', async () => {
    // The service queries `where: { enabled: true }`; a staged-only
    // row arrives as an empty array.
    prismaMock.institution.findUnique.mockResolvedValueOnce({
      id: 'inst-1',
      slug: 'staged-uni',
      ssoProviders: [],
    });
    const res = await request(buildApp()).get('/api/sso/staged-uni/discover');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SSO_NOT_CONFIGURED');
  });

  it('returns 200 with public IdP fields when one IdP is configured + enabled', async () => {
    prismaMock.institution.findUnique.mockResolvedValueOnce({
      id: 'inst-1',
      slug: 'enabled-uni',
      ssoProviders: [
        {
          id: 'idp-1',
          enabled: true,
          protocol: 'OIDC',
          displayName: 'Enabled University',
          priority: 100,
          // Sensitive fields would never be selected by the service
          // (it uses `select: { id, protocol, displayName, priority }`),
          // but assert the response also doesn't leak them in case the
          // mock is over-broad.
          oidcClientSecret: 'super-secret-do-not-leak',
          samlCert: '-----BEGIN CERT-----\nFAKE\n-----END CERT-----',
        },
      ],
    });

    const res = await request(buildApp()).get('/api/sso/enabled-uni/discover');
    expect(res.status).toBe(200);
    expect(res.body.data.protocol).toBe('OIDC');
    expect(res.body.data.displayName).toBe('Enabled University');
    expect(res.body.data.loginUrl).toBe('/api/sso/enabled-uni/login');
    // Phase 11.13 — discovery surfaces an `options` array. Single-IdP
    // tenants get a one-element array; the back-compat top-level
    // fields above mirror options[0].
    expect(res.body.data.options).toHaveLength(1);
    expect(res.body.data.options[0].id).toBe('idp-1');
    expect(res.body.data.options[0].loginUrl).toBe('/api/sso/enabled-uni/login?idpId=idp-1');
    // Defence in depth: pin that no sensitive fields leaked.
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain('super-secret-do-not-leak');
    expect(serialised).not.toContain('FAKE');
  });

  it('returns options[] sorted by priority when multiple IdPs are enabled (Phase 11.13)', async () => {
    prismaMock.institution.findUnique.mockResolvedValueOnce({
      id: 'inst-1',
      slug: 'multi-uni',
      // Mock returns the rows in the order Prisma would, sorted by
      // priority. The service's `orderBy` ensures this is deterministic.
      ssoProviders: [
        { id: 'idp-primary', enabled: true, protocol: 'SAML', displayName: 'Main IdP', priority: 50 },
        { id: 'idp-backup', enabled: true, protocol: 'OIDC', displayName: 'Backup IdP', priority: 200 },
      ],
    });
    const res = await request(buildApp()).get('/api/sso/multi-uni/discover');
    expect(res.status).toBe(200);
    expect(res.body.data.options).toHaveLength(2);
    expect(res.body.data.options[0].displayName).toBe('Main IdP');
    expect(res.body.data.options[1].displayName).toBe('Backup IdP');
    // Back-compat top-level fields surface the highest-priority option.
    expect(res.body.data.protocol).toBe('SAML');
    expect(res.body.data.displayName).toBe('Main IdP');
  });

  it('does not require an Authorization header (anonymous discovery is by design)', async () => {
    prismaMock.institution.findUnique.mockResolvedValueOnce({
      id: 'inst-1',
      slug: 'enabled-uni',
      ssoProviders: [{ id: 'idp-1', enabled: true, protocol: 'SAML', displayName: 'Enabled University', priority: 100 }],
    });
    const res = await request(buildApp()).get('/api/sso/enabled-uni/discover');
    // Without any Authorization header, the endpoint still serves a 200.
    expect(res.status).toBe(200);
  });

  it('Phase 11.13 — each option in the multi-IdP response carries its own loginUrl with ?idpId=', async () => {
    prismaMock.institution.findUnique.mockResolvedValueOnce({
      id: 'inst-1',
      slug: 'multi-uni',
      ssoProviders: [
        { id: 'primary-saml', enabled: true, protocol: 'SAML', displayName: 'Federated SAML', priority: 50 },
        { id: 'fallback-oidc', enabled: true, protocol: 'OIDC', displayName: 'Vendor OIDC', priority: 200 },
      ],
    });
    const res = await request(buildApp()).get('/api/sso/multi-uni/discover');
    expect(res.status).toBe(200);
    const opts = res.body.data.options as Array<{ id: string; loginUrl: string }>;
    expect(opts).toHaveLength(2);
    expect(opts[0]?.loginUrl).toBe('/api/sso/multi-uni/login?idpId=primary-saml');
    expect(opts[1]?.loginUrl).toBe('/api/sso/multi-uni/login?idpId=fallback-oidc');
    // Back-compat top-level loginUrl still goes to the bare endpoint —
    // legacy single-IdP frontends keep working.
    expect(res.body.data.loginUrl).toBe('/api/sso/multi-uni/login');
  });
});
