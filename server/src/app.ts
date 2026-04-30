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
import gdprRouter from './api/gdpr/gdpr.router';
import ssoRouter from './api/sso/sso.router';
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

  app.use('/api', healthRouter);
  app.get('/api/ready', readiness);

  app.use('/api/auth', authRateLimiter, authRouter);
  app.use('/api/institutions', institutionsRouter);

  const frameworkScoped = [optionalJWT, frameworkContext, tierGate] as const;
  app.use('/api/systems', ...frameworkScoped, systemsRouter);
  app.use('/api/capabilities', ...frameworkScoped, capabilitiesRouter);
  app.use('/api/scores', ...frameworkScoped, scoresRouter);
  app.use('/api/export', ...frameworkScoped, exportRouter);

  app.use('/api/vendors', vendorsRouter);
  app.use('/api/research', researchRouter);
  app.use('/api/scoring', scoringRouter);
  app.use('/api/chat', chatRouter);

  app.use('/api/baskets', basketsRouter);
  app.use('/api/tco', tcoRouter);
  app.use('/api/procurement', procurementRouter);
  app.use('/api/integration', integrationRouter);

  app.use('/api/architecture', architectureRouter);
  app.use('/api/value', valueRouter);
  app.use('/api/documents', documentsRouter);

  app.use('/api/vendor-portal', ...frameworkScoped, vendorPortalRouter);
  app.use('/api/evaluations', evaluationsRouter);
  app.use('/api/subscriptions', subscriptionsRouter);
  app.use('/api/admin', adminRouter);

  app.use('/api/sector/analytics', sectorAnalyticsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/keys', keysRouter);

  app.use('/api/frameworks', frameworksRouter);
  app.use('/api/framework-mappings', frameworkMappingsRouter);

  // Phase 10.7 — SSO discovery (scaffold). Anonymous endpoint that
  // tells the frontend whether SSO is available for an institution.
  // The actual SAML/OIDC login flows ship in a follow-up PR.
  app.use('/api/sso', ssoRouter);

  // Phase 10.8 — GDPR data-subject rights (data export, erasure).
  // Mounted at /me because they're personal rights, not admin actions.
  app.use('/api/me', gdprRouter);

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found', requestId: req.id },
    });
  });

  app.use(errorHandler);

  return app;
}
