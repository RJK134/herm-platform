import express, { type Express } from 'express';
import cors from 'cors';
import { checkEnvironment } from './utils/env-check';
import { errorHandler } from './middleware/errorHandler';
import {
  helmetMiddleware,
  apiRateLimiter,
  authRateLimiter,
  scimRateLimiter,
} from './middleware/security';
import { requestId } from './middleware/requestId';
import { httpLogger } from './middleware/httpLogger';
import { metricsMiddleware } from './middleware/metrics';
import { renderMetrics } from './lib/metrics';
import healthRouter from './api/health/health.router';
import { readiness } from './api/health/health.controller';
import systemsRouter from './api/systems/systems.router';
import capabilitiesRouter from './api/capabilities/capabilities.router';
import scoresRouter from './api/scores/scores.router';
import basketsRouter from './api/baskets/baskets.router';
import exportRouter from './api/export/export.router';
import vendorsRouter from './api/vendors/vendors.router';
import researchRouter from './api/research/research.router';
import scoringRouter from './api/scoring/scoring.router';
import chatRouter from './api/chat/chat.router';
import tcoRouter from './api/tco/tco.router';
import procurementRouter from './api/procurement/procurement.router';
import integrationRouter from './api/integration/integration.router';
import authRouter from './api/auth/auth.router';
import institutionsRouter from './api/institutions/institutions.router';
import architectureRouter from './api/architecture/architecture.router';
import valueRouter from './api/value/value.router';
import documentsRouter from './api/documents/documents.router';
import vendorPortalRouter from './api/vendor-portal/vendor-portal.router';
import evaluationsRouter from './api/evaluations/evaluations.router';
import subscriptionsRouter from './api/subscriptions/subscriptions.router';
import adminRouter from './api/admin/admin.router';
import sectorAnalyticsRouter from './api/sector-analytics/sector-analytics.router';
import notificationsRouter from './api/notifications/notifications.router';
import usageRouter from './api/usage/usage.router';
import invitesRouter from './api/invites/invites.router';
import keysRouter from './api/keys/keys.router';
import frameworksRouter from './api/frameworks/frameworks.router';
import frameworkMappingsRouter from './api/framework-mappings/framework-mappings.router';
import gdprRouter from './api/gdpr/gdpr.router';
import openApiRouter from './api/openapi/openapi.router';
import ssoRouter from './api/sso/sso.router';
import { createScimRouter } from './api/scim/scim.router';
import { frameworkContext } from './middleware/framework-context';
import { tierGate } from './middleware/tier-gate';
import { optionalJWT } from './middleware/auth';
import { apiKeyAuth } from './middleware/api-key-auth';

checkEnvironment();

export function createApp(): Express {
  const app = express();
  const allowedOrigin = process.env['FRONTEND_URL'] || 'http://localhost:5173';

  app.use(requestId);
  app.use(httpLogger);
  // Phase 12.2 — record HTTP request duration / count / in-flight on
  // every request. Mounted early (before auth + rate-limit) so the
  // metrics surface every observable request, including 401s and 429s.
  // The route label collapses dynamic IDs via Express's matched route
  // pattern; see middleware/metrics.ts for the cardinality posture.
  app.use(metricsMiddleware);
  app.use(helmetMiddleware);
  app.use(cors({ origin: allowedOrigin, credentials: true }));

  // Phase 12.2 — Prometheus scrape endpoint. Outside the `/api` mount
  // so scrapers reach a stable, version-free path; outside the
  // rate-limiter mounts so a 15-second scrape interval doesn't burn
  // anonymous-tier quota. Production deployments expose this on a
  // separate, internally-routed port (see RUNBOOK).
  app.get('/metrics', async (_req, res, next) => {
    try {
      const body = await renderMetrics();
      res.type('text/plain; version=0.0.4').send(body);
    } catch (err) {
      next(err);
    }
  });

  // Stripe webhook needs the unparsed body to verify the signature. The
  // raw-body parser MUST be registered before `express.json()` — otherwise
  // the global JSON parser consumes the body stream first and the webhook
  // handler receives a parsed object cast to Buffer, which fails Stripe's
  // signature check. Scoped to the exact webhook path so no other route is
  // affected.
  app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));

  // RFC 7644 SCIM clients (Okta, Entra ID, OneLogin) send
  // `Content-Type: application/scim+json`. Express's default JSON
  // parser only matches `application/json`, so without this `type`
  // override `req.body` would be undefined for every SCIM POST/PUT
  // and the controllers' Zod parse would 400 with a misleading
  // `invalidSyntax` error. Adding `application/scim+json` here keeps
  // existing /api routes parsing identically while making /scim/v2
  // work with real IdPs.
  app.use(express.json({ limit: '1mb', type: ['application/json', 'application/scim+json'] }));
  app.use(express.urlencoded({ extended: true }));

  // Auth-context resolution for the rate limiter.
  // The tier-aware limiter (apiRateLimiter, see middleware/security.ts) needs
  // to know which tier the caller belongs to in order to pick the right
  // ceiling. Two parallel paths populate that context:
  //   - apiKeyAuth checks for a herm_pk_… bearer; resolves req.apiUser
  //   - optionalJWT checks for a JWT bearer; resolves req.user
  // Both are no-ops for anonymous callers (default to the lowest ceiling).
  // Per-route auth (`authenticateJWT`) still runs further down the chain
  // and re-validates the JWT — these app-level decoders just establish
  // the rate-limit context.
  // Applied to both /api and /api/v1 so the alias shares the same
  // auth-context and rate-limit enforcement.
  for (const base of ['/api', '/api/v1'] as const) {
    app.use(base, apiKeyAuth);
    app.use(base, optionalJWT);
    app.use(base, apiRateLimiter);
  }

  // Mount every public route under both `/api` (legacy alias) and
  // `/api/v1` (versioned base). Future breaking changes ship as
  // `/api/v2/*` — the unversioned `/api/*` will eventually be retired
  // with a deprecation window. Until then, every existing client keeps
  // working untouched, while new integrators can pin to `/api/v1` for a
  // stable contract. (Phase 10.4)
  const frameworkScoped = [optionalJWT, frameworkContext, tierGate] as const;
  for (const base of ['/api', '/api/v1'] as const) {
    app.use(base, healthRouter);
    app.get(`${base}/ready`, readiness);
    app.use(base, openApiRouter);

    app.use(`${base}/auth`, authRateLimiter, authRouter);
    app.use(`${base}/institutions`, institutionsRouter);

    app.use(`${base}/systems`, ...frameworkScoped, systemsRouter);
    app.use(`${base}/capabilities`, ...frameworkScoped, capabilitiesRouter);
    app.use(`${base}/scores`, ...frameworkScoped, scoresRouter);
    app.use(`${base}/export`, ...frameworkScoped, exportRouter);

    app.use(`${base}/vendors`, vendorsRouter);
    app.use(`${base}/research`, researchRouter);
    app.use(`${base}/scoring`, scoringRouter);
    app.use(`${base}/chat`, chatRouter);

    app.use(`${base}/baskets`, basketsRouter);
    app.use(`${base}/tco`, tcoRouter);
    app.use(`${base}/procurement`, procurementRouter);
    app.use(`${base}/integration`, integrationRouter);

    app.use(`${base}/architecture`, architectureRouter);
    app.use(`${base}/value`, valueRouter);
    app.use(`${base}/documents`, documentsRouter);

    app.use(`${base}/vendor-portal`, ...frameworkScoped, vendorPortalRouter);
    app.use(`${base}/evaluations`, evaluationsRouter);
    // Keep subscriptions unversioned so the Stripe webhook continues to use
    // the dedicated raw-body handling registered for /api/subscriptions/webhook.
    if (base === '/api') {
      app.use(`${base}/subscriptions`, subscriptionsRouter);
    }
    app.use(`${base}/admin`, adminRouter);

    app.use(`${base}/sector/analytics`, sectorAnalyticsRouter);
    app.use(`${base}/notifications`, notificationsRouter);
    app.use(`${base}/usage`, usageRouter);
    // Phase 16.5 — public invite-claim surface. GET /api/invites/:token
    // and POST /api/invites/:token/claim run before the user has any
    // auth session; the 32-byte random token in the URL is the auth.
    // Admin-side creation lives under /api/admin/users/invite (JWT-gated).
    app.use(`${base}/invites`, invitesRouter);
    app.use(`${base}/keys`, keysRouter);

    app.use(`${base}/frameworks`, frameworksRouter);
    app.use(`${base}/framework-mappings`, frameworkMappingsRouter);
  }

  // Phase 10.7 — SSO discovery (scaffold). Anonymous endpoint that
  // tells the frontend whether SSO is available for an institution.
  // The actual SAML/OIDC login flows ship in a follow-up PR.
  app.use('/api/sso', ssoRouter);

  // Phase 11.11 — SCIM 2.0 provisioning. Mounted at the conventional
  // `/scim/v2` path (NOT under `/api/*`) so SCIM clients (Okta, Entra,
  // Google) reach a standard URL without HERM-specific prefixing. Auth
  // is API-key + `admin:scim` permission, not JWT — wired inside the
  // router itself. Skipped under /api/v1 because SCIM is its own spec.
  //
  // Phase 11.15 (M2) — `scimRateLimiter` mounts BEFORE the router so
  // unauthenticated probes can't hammer the SCIM auth chain. The auth
  // check inside the router runs after this limiter, so per-IP is the
  // right bucket (no stable apiKey id yet at this point).
  app.use('/scim/v2', scimRateLimiter, createScimRouter());

  // Phase 10.8 — GDPR data-subject rights (data export, erasure).
  // Mounted at /me because they're personal rights, not admin actions.
  // Keep them available under both `/api/*` and `/api/v1/*` to match
  // the public-route mounting contract above.
  for (const base of ['/api', '/api/v1'] as const) {
    app.use(`${base}/me`, gdprRouter);
  }

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found', requestId: req.id },
    });
  });

  app.use(errorHandler);

  return app;
}
