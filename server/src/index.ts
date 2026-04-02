import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
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

const app = express();
const PORT = process.env['PORT'] || 3002;

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
    },
  });
});

// Auth (unauthenticated)
app.use('/api/auth', authRouter);

// Institution management (authenticated — guards inside router)
app.use('/api/institutions', institutionsRouter);

// Analytics (open — read-only reference data)
app.use('/api/systems', systemsRouter);
app.use('/api/capabilities', capabilitiesRouter);
app.use('/api/scores', scoresRouter);
app.use('/api/export', exportRouter);

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
app.use('/api/vendor-portal', vendorPortalRouter);
app.use('/api/evaluations', evaluationsRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/admin', adminRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

// Global error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`HERM Platform API running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

export default app;
