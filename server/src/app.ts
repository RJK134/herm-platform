import express from 'express';
import cors from 'cors';
import { checkEnvironment } from './utils/env-check';
import { errorHandler } from './middleware/errorHandler';
import { helmetMiddleware, apiRateLimiter, authRateLimiter } from './middleware/security';
import { requestId } from './middleware/requestId';
import { httpLogger } from './middleware/httpLogger';
import { liveness, readiness } from './api/health/health.controller';
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

const app = express();

// Allow CORS origin to be configured per environment
const ALLOWED_ORIGIN = process.env['FRONTEND_URL'] || 'http://localhost:5173';

// Baseline middleware — order matters: requestId first so every log carries it
app.use(requestId);
app.use(httpLogger);
app.use(helmetMiddleware);
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', apiRateLimiter);

// Health & readiness (no rate limit, no auth)
app.get('/api/health', liveness);
app.get('/api/ready', readiness);

// Auth (unauthenticated — stricter rate limit)
app.use('/api/auth', authRateLimiter, authRouter);

// Institution management (authenticated — guards inside router)
app.use('/api/institutions', institutionsRouter);

// Framework-scoped analytics + reference data.
//
// Middleware chain:
//   1. optionalJWT   — populates req.user when a valid token is present so
//                      the tier can be read; anonymous callers just get
//                      req.user === undefined.
//   2. frameworkContext — resolves req.framework / req.frameworkId from
//                      ?frameworkId (explicit) or the first public active
//                      framework (default). Without it, service-layer
//                      queries would mix frameworks.
//   3. tierGate       — rejects free/anonymous callers trying to reach a
//                      non-public framework even by explicit id. This
//                      closes the paywall-bypass that explicit
//                      ?frameworkId=<proprietary-id> would otherwise open.
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
app.use('/api/chat', chatRouter);

// Procurement tools (anonymous-friendly via default institution)
app.use('/api/baskets', basketsRouter);
app.use('/api/tco', tcoRouter);
app.use('/api/procurement', procurementRouter);
app.use('/api/integration', integrationRouter);

// Phase 3 — Architecture, Value Analysis, Document Generation
app.use('/api/architecture', architectureRouter);
app.use('/api/value', valueRouter);
app.use('/api/documents', documentsRouter);

// Phase 5 — Vendor Portal, Team Workspaces, Payments.
// Same framework-scoped chain: optionalJWT → frameworkContext → tierGate
// so getOwnScores can scope CapabilityScore and vendors cannot pass a
// proprietary frameworkId they are not entitled to.
app.use('/api/vendor-portal', ...frameworkScoped, vendorPortalRouter);
app.use('/api/evaluations', evaluationsRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/admin', adminRouter);

// Phase 6 — Sector Analytics, Notifications, API Keys
app.use('/api/sector/analytics', sectorAnalyticsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/keys', keysRouter);

// Phase 7 — Multi-framework support
app.use('/api/frameworks', frameworksRouter);

// Phase 8 — Cross-framework mappings (Enterprise tier)
app.use('/api/framework-mappings', frameworkMappingsRouter);

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found', requestId: req.id },
  });
});

// Global error handler
app.use(errorHandler);

export default app;
