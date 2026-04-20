import express from 'express';
import cors from 'cors';
import prisma from './utils/prisma';
import { checkEnvironment } from './utils/env-check';
import { errorHandler } from './middleware/errorHandler';
import { helmetMiddleware, apiRateLimiter, authRateLimiter } from './middleware/security';
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

// Validate environment variables at startup.
// Placed after all imports because ES module static imports are hoisted —
// a call here between imports would not actually run first.
checkEnvironment();

const app = express();

// Allow CORS origin to be configured per environment
const ALLOWED_ORIGIN = process.env['FRONTEND_URL'] || 'http://localhost:5173';

// Middleware
app.use(helmetMiddleware);
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', apiRateLimiter);

// Health check — verifies DB connectivity before returning healthy
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        db: 'connected',
      },
    });
  } catch {
    res.status(503).json({
      success: false,
      data: {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        db: 'unavailable',
      },
    });
  }
});

// Auth (unauthenticated — stricter rate limit)
app.use('/api/auth', authRateLimiter, authRouter);

// Institution management (authenticated — guards inside router)
app.use('/api/institutions', institutionsRouter);

// Analytics (open — read-only reference data).
// frameworkContext populates req.frameworkId so service layer queries
// scope to the active framework. Without it, Capability / FrameworkDomain /
// CapabilityScore queries would silently mix HERM + FHE data. The
// middleware falls back to the first public active framework when no
// ?frameworkId is supplied.
app.use('/api/systems', frameworkContext, systemsRouter);
app.use('/api/capabilities', frameworkContext, capabilitiesRouter);
app.use('/api/scores', frameworkContext, scoresRouter);
// Export endpoints format framework-scoped data (scores, domains, capabilities)
// so they need the same active-framework resolution as the analytics routes.
app.use('/api/export', frameworkContext, exportRouter);

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

// Phase 5 — Vendor Portal, Team Workspaces, Payments
// frameworkContext attached so getOwnScores can scope CapabilityScore.
app.use('/api/vendor-portal', frameworkContext, vendorPortalRouter);
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
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

// Global error handler
app.use(errorHandler);

export default app;
