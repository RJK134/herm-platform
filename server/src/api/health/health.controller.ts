import type { Request, Response } from 'express';
import prisma from '../../utils/prisma';
import { logger } from '../../lib/logger';

export function liveness(_req: Request, res: Response): void {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
    },
  });
}

/**
 * Readiness: is the server able to serve requests?
 * Checks DB connectivity. Returns 503 if any dependency is unhealthy.
 * Used by container orchestrators; not by the client.
 */
export async function readiness(req: Request, res: Response): Promise<void> {
  const checks: Record<string, unknown> = {};
  let databaseOk = true;
  let databaseMessage: string | undefined;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    logger.warn({ requestId: req.id, err }, 'readiness: database check failed');
    databaseOk = false;
    databaseMessage = err instanceof Error ? err.message : 'unknown error';
  }

  checks['db'] = databaseOk ? 'ok' : 'fail';
  checks['database'] = databaseMessage
    ? { ok: databaseOk, message: databaseMessage }
    : { ok: databaseOk };

  const allOk = databaseOk;
  res.status(allOk ? 200 : 503).json({
    success: allOk,
    data: {
      status: allOk ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    },
  });
}
