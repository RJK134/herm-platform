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
  it('returns 404 SSO_NOT_CONFIGURED when the institution does not exist', async () => {
    prismaMock.institution.findUnique.mockResolvedValueOnce(null);
    const res = await request(buildApp()).get('/api/sso/unknown-uni/discover');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SSO_NOT_CONFIGURED');
  });

  it('returns 404 SSO_NOT_CONFIGURED when the institution has no SsoIdentityProvider row', async () => {
    prismaMock.institution.findUnique.mockResolvedValueOnce({
      id: 'inst-1',
      slug: 'no-sso-uni',
      ssoProvider: null,
    });
    const res = await request(buildApp()).get('/api/sso/no-sso-uni/discover');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SSO_NOT_CONFIGURED');
  });

  it('returns 404 SSO_NOT_CONFIGURED when the row exists but enabled=false (staged config)', async () => {
    prismaMock.institution.findUnique.mockResolvedValueOnce({
      id: 'inst-1',
      slug: 'staged-uni',
      ssoProvider: {
        enabled: false,
        protocol: 'SAML',
        displayName: 'Staged University',
      },
    });
    const res = await request(buildApp()).get('/api/sso/staged-uni/discover');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SSO_NOT_CONFIGURED');
  });

  it('returns 200 with public IdP fields when configured + enabled', async () => {
    prismaMock.institution.findUnique.mockResolvedValueOnce({
      id: 'inst-1',
      slug: 'enabled-uni',
      ssoProvider: {
        enabled: true,
        protocol: 'OIDC',
        displayName: 'Enabled University',
        // Sensitive fields that MUST NOT leak through the response.
        oidcClientSecret: 'super-secret-do-not-leak',
        samlCert: '-----BEGIN CERT-----\nFAKE\n-----END CERT-----',
      },
    });

    const res = await request(buildApp()).get('/api/sso/enabled-uni/discover');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      protocol: 'OIDC',
      displayName: 'Enabled University',
      loginUrl: '/api/sso/enabled-uni/login',
    });
    // Defence in depth: pin that no sensitive fields leaked into the response.
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain('super-secret-do-not-leak');
    expect(serialised).not.toContain('FAKE');
    expect(res.body.data.oidcClientSecret).toBeUndefined();
    expect(res.body.data.samlCert).toBeUndefined();
  });

  it('does not require an Authorization header (anonymous discovery is by design)', async () => {
    prismaMock.institution.findUnique.mockResolvedValueOnce({
      id: 'inst-1',
      slug: 'enabled-uni',
      ssoProvider: { enabled: true, protocol: 'SAML', displayName: 'Enabled University' },
    });
    const res = await request(buildApp()).get('/api/sso/enabled-uni/discover');
    // Without any Authorization header, the endpoint still serves a 200.
    expect(res.status).toBe(200);
  });
});
