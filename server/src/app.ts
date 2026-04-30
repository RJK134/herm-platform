import express, { type Express } from 'express';
import cors from 'cors';
import { checkEnvironment } from './utils/env-check';
import { errorHandler } from './middleware/errorHandler';
import { helmetMiddleware, apiRateLimiter, authRateLimiter } from './middleware/security';
import { requestId } from './middleware/requestId';
import { httpLogger } from './middleware/httpLogger';
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
import keysRouter from './api/keys/keys.router';
import frameworksRouter from './api/frameworks/frameworks.router';
import frameworkMappingsRouter from './api/framework-mappings/framework-mappings.router';
import openApiRouter from './api/openapi/openapi.router';
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
  app.use(helmetMiddleware);
  app.use(cors({ origin: allowedOrigin, credentials: true }));

  // Stripe webhook needs the unparsed body to verify the signature. The
  // raw-body parser MUST be registered before `express.json()` — otherwise
  // the global JSON parser consumes the body stream first and the webhook
  // handler receives a parsed object cast to Buffer, which fails Stripe's
  // signature check. Scoped to the exact webhook path so no other route is
  // affected.
  app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));

  app.use(express.json({ limit: '1mb' }));
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
  app.use('/api', apiKeyAuth);
  app.use('/api', optionalJWT);
  app.use('/api', apiRateLimiter);

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
    app.use(`${base}/keys`, keysRouter);

    app.use(`${base}/frameworks`, frameworksRouter);
    app.use(`${base}/framework-mappings`, frameworkMappingsRouter);
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
