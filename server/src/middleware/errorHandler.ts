import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';
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

  if (err instanceof AppError) {
    const log = err.statusCode >= 500 ? logger.error : logger.warn;
    log(
      { requestId, code: err.code, status: err.statusCode, path: req.path, method: req.method },
      err.message,
    );
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
