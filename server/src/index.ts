import express from 'express';
import cors from 'cors';
import prisma from './utils/prisma';
import { errorHandler } from './middleware/errorHandler';
import { helmetMiddleware, apiRateLimiter, authRateLimiter } from './middleware/security';
import { requestId } from './middleware/requestId';
import { httpLogger } from './middleware/httpLogger';
import { logger } from './lib/logger';
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

export const app = express();
const PORT = process.env['PORT'] || 3002;

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

// Analytics (open — read-only reference data)
app.use('/api/systems', systemsRouter);
app.use('/api/capabilities', capabilitiesRouter);
app.use('/api/scores', scoresRouter);
app.use('/api/export', exportRouter);

// Intelligence layer (open — reference data; chat is authed — see chat.router)
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

// Phase 5 — Vendor Portal, Team Workspaces, Payments
app.use('/api/vendor-portal', vendorPortalRouter);
app.use('/api/evaluations', evaluationsRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/admin', adminRouter);

// Phase 6 — Sector Analytics, Notifications, API Keys
app.use('/api/sector/analytics', sectorAnalyticsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/keys', keysRouter);

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found', requestId: req.id },
  });
});

// Global error handler
app.use(errorHandler);

// Only start listening when run directly (not when imported by tests)
const isDirectRun = require.main === module;
let server: ReturnType<typeof app.listen> | undefined;

if (isDirectRun) {
  server = app.listen(PORT, () => {
    logger.info({ port: PORT }, `HERM Platform API running on http://localhost:${PORT}`);
  });

  // Graceful shutdown — closes HTTP server then disconnects Prisma before exiting
  // Ensures in-flight requests complete and DB connections are cleanly released
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down gracefully');
    server?.close(async () => {
      await prisma.$disconnect();
      logger.info('server and db connections closed');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('force-exit after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default app;
