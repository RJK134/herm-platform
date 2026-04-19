import { Router, Request, Response } from 'express';
import prisma from '../../utils/prisma';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * Liveness probe — returns 200 as long as the process is responsive.
 * Must NOT touch external dependencies (DB, cache) so it doesn't cascade on
 * outages. Use the readiness endpoint for dependency checks.
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env['APP_VERSION'] ?? '2.0.0',
    },
  });
});

/**
 * Readiness probe — verifies the app can serve traffic.
 * Executes a trivial query against the database. Returns 503 if any check
 * fails so load balancers/orchestrators stop routing traffic.
 */
router.get('/readiness', async (req: Request, res: Response) => {
  const checks: Record<string, 'ok' | 'fail'> = {};
  let ok = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks['db'] = 'ok';
  } catch (err) {
    checks['db'] = 'fail';
    ok = false;
    logger.error({ err, reqId: req.id }, 'readiness: database check failed');
  }

  res.status(ok ? 200 : 503).json({
    success: ok,
    data: { status: ok ? 'ready' : 'not-ready', checks, timestamp: new Date().toISOString() },
  });
});

export default router;
