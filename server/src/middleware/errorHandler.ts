import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    // 4xx errors are client problems — log at info/warn, not error.
    const log = err.statusCode >= 500 ? logger.error : logger.warn;
    log.call(logger, { reqId: req.id, code: err.code, status: err.statusCode }, err.message);
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
    return;
  }

  logger.error({ err, reqId: req.id, path: req.path, method: req.method }, 'unhandled error');
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env['NODE_ENV'] === 'development' ? err.message : 'An unexpected error occurred',
    },
  });
}
