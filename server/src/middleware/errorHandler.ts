import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';
import { captureServerError } from '../lib/sentry';
import { AppError } from '../utils/errors';

/**
 * Maps Prisma known request errors onto our AppError taxonomy so clients see
 * a consistent error shape. P2025 = record not found, P2002 = unique constraint.
 */
function mapPrismaError(err: Prisma.PrismaClientKnownRequestError): AppError {
  if (err.code === 'P2025') {
    return new AppError(404, 'NOT_FOUND', 'Record not found');
  }
  if (err.code === 'P2002') {
    return new AppError(409, 'CONFLICT', 'A record with this value already exists');
  }
  if (err.code === 'P2003') {
    return new AppError(409, 'CONFLICT', 'Related record not found');
  }
  return new AppError(400, 'DATABASE_ERROR', 'Database request error');
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.id;
  // pino-http types req.id as `ReqId` (string | number | object). Stringify
  // for the Sentry capture context, which expects a tag value.
  const requestIdStr = requestId !== undefined ? String(requestId) : undefined;

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
        requestId,
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaError(err);
    logger.warn(
      { requestId, prismaCode: err.code, path: req.path, method: req.method },
      'Prisma request error mapped',
    );
    res.status(mapped.statusCode).json({
      success: false,
      error: { code: mapped.code, message: mapped.message, requestId },
    });
    return;
  }

  // Connection / startup failures surface as PrismaClientInitializationError —
  // most commonly a stale DATABASE_URL (wrong port after the docker-compose
  // port change in PR #9), wrong credentials, or Postgres not running.
  // Surface as 503 with an actionable message instead of a generic 500, and
  // log the underlying Prisma message so the dev's terminal shows what's wrong.
  if (err instanceof Prisma.PrismaClientInitializationError) {
    logger.error(
      { requestId, prismaCode: err.errorCode, path: req.path, method: req.method, err: err.message },
      'Database unreachable — check DATABASE_URL and that Postgres is running',
    );
    // 503 is operational, not a user bug, but it's the kind of incident the
    // ops team needs paging-grade visibility on. Capture it.
    captureServerError(err, {
      requestId: requestIdStr,
      userId: req.user?.userId,
      path: req.path,
      method: req.method,
    });
    // Prisma's message is a multi-line dump (query context + error). Pull out
    // the "Can't reach database server..." line specifically; fall back to
    // the last non-empty line so the dev still sees something useful.
    const lines = err.message.split('\n').map((l) => l.trim()).filter(Boolean);
    const reachLine =
      lines.find((l) => /reach database server|connect.*database|authentication failed/i.test(l)) ??
      lines[lines.length - 1] ??
      'connection refused';
    res.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message:
          process.env['NODE_ENV'] === 'development'
            ? `Database unreachable: ${reachLine}`
            : 'Database is currently unavailable',
        requestId,
      },
    });
    return;
  }

  if (err instanceof AppError) {
    const log = err.statusCode >= 500 ? logger.error : logger.warn;
    log(
      { requestId, code: err.code, status: err.statusCode, path: req.path, method: req.method },
      err.message,
    );
    // Only 5xx AppErrors are server bugs worth paging on; 4xx are user/route
    // errors and don't belong in error-tracking.
    if (err.statusCode >= 500) {
      captureServerError(err, {
        requestId: requestIdStr,
        userId: req.user?.userId,
        path: req.path,
        method: req.method,
      });
    }
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, requestId },
    });
    return;
  }

  logger.error(
    { requestId, err, path: req.path, method: req.method },
    'Unhandled server error',
  );
  // Catch-all: an unmapped Error → 500. Always capture — these are unhandled
  // bugs by definition.
  captureServerError(err, {
    requestId: requestIdStr,
    userId: req.user?.userId,
    path: req.path,
    method: req.method,
  });
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env['NODE_ENV'] === 'development'
          ? err.message
          : 'An unexpected error occurred',
      requestId,
    },
  });
}
