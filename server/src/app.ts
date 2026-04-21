import express, { Express } from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { checkEnvironment } from './utils/env-check';
import { errorHandler } from './middleware/errorHandler';
import { helmetMiddleware, apiRateLimiter, authRateLimiter } from './middleware/security';
import { requestId } from './middleware/requestId';
import { logger } from './utils/logger';

import healthRouter from './api/health/health.router';
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
import { frameworkContext } from './middleware/framework-context';
import { tierGate } from './middleware/tier-gate';
import { optionalJWT } from './middleware/auth';

// Validate environment variables at startup.
// Placed after all imports because ES module static imports are hoisted —
// a call here between imports would not actually run first.
checkEnvironment();

/**
 * Build the Express app.
 *
 * Separated from `index.ts` so tests can import the app and drive it with
 * supertest without starting an HTTP listener.
 */
export function createApp(): Express {
  const app = express();

  const ALLOWED_ORIGIN = process.env['FRONTEND_URL'] || 'http://localhost:5173';

  // requestId must run first so every downstream log and response carries it.
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      // In tests the root logger is silenced; this keeps the HTTP stream quiet too.
      autoLogging: process.env['NODE_ENV'] !== 'test',
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          userId: (req.raw as express.Request).user?.userId,
        }),
      },
    }),
  );

  app.use(helmetMiddleware);
  app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/api', apiRateLimiter);

  // Health + readiness — kept at the top of the route table, no auth required.
  app.use('/api', healthRouter);

  // Auth (unauthenticated — stricter rate limit)
  app.use('/api/auth', authRateLimiter, authRouter);

  // Institution management (authenticated — guards inside router)
  app.use('/api/institutions', institutionsRouter);

  // Framework-scoped analytics + reference data.
  //
  // Middleware chain:
  //   1. optionalJWT      — populates req.user when a valid token is present so
  //                         the tier can be read; anonymous callers just get
  //                         req.user === undefined.
  //   2. frameworkContext — resolves req.framework / req.frameworkId from
  //                         ?frameworkId (explicit) or the first public active
  //                         framework (default). Without it, service-layer
  //                         queries would mix frameworks.
  //   3. tierGate         — rejects free/anonymous callers trying to reach a
  //                         non-public framework even by explicit id. This
  //                         closes the paywall-bypass that explicit
  //                         ?frameworkId=<proprietary-id> would otherwise open.
  const frameworkScoped = [optionalJWT, frameworkContext, tierGate];
  app.use('/api/systems', ...frameworkScoped, systemsRouter);
  app.use('/api/capabilities', ...frameworkScoped, capabilitiesRouter);
  app.use('/api/scores', ...frameworkScoped, scoresRouter);
  // Export endpoints format framework-scoped data (scores, domains,
  // capabilities) so they sit behind the same chain.
  app.use('/api/export', ...frameworkScoped, exportRouter);

  // Intelligence layer (open — reference data)
  app.use('/api/vendors', vendorsRouter);
  app.use('/api/research', researchRouter);
  app.use('/api/scoring', scoringRouter);

  // AI chat — authenticated and rate-limited inside the router.
  app.use('/api/chat', chatRouter);

  // Procurement tools — baskets are now authenticated; the others stay open
  // for the public procurement/TCO calculators (no mutations to shared state).
  app.use('/api/baskets', basketsRouter);
  app.use('/api/tco', tcoRouter);
  app.use('/api/procurement', procurementRouter);
  app.use('/api/integration', integrationRouter);

  // Architecture, Value Analysis, Document Generation
  app.use('/api/architecture', architectureRouter);
  app.use('/api/value', valueRouter);
  app.use('/api/documents', documentsRouter);

  // Vendor Portal, Team Workspaces, Payments.
  // Same framework-scoped chain: optionalJWT → frameworkContext → tierGate
  // so getOwnScores can scope CapabilityScore and vendors cannot pass a
  // proprietary frameworkId they are not entitled to.
  app.use('/api/vendor-portal', ...frameworkScoped, vendorPortalRouter);
  app.use('/api/evaluations', evaluationsRouter);
  app.use('/api/subscriptions', subscriptionsRouter);
  app.use('/api/admin', adminRouter);

  // Sector Analytics, Notifications, API Keys
  app.use('/api/sector/analytics', sectorAnalyticsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/keys', keysRouter);

  // Multi-framework support
  app.use('/api/frameworks', frameworksRouter);
  app.use('/api/framework-mappings', frameworkMappingsRouter);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  app.use(errorHandler);

  return app;
}

const app = createApp();

export default app;
