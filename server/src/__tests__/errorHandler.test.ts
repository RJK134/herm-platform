import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../middleware/errorHandler';
import { AppError, NotFoundError, ForbiddenError } from '../utils/errors';

vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: { success: boolean; error: { code: string; requestId: string; details?: unknown } } };
}

function makeReq(): Request {
  return { id: 'req-test', path: '/x', method: 'GET' } as unknown as Request;
}

describe('errorHandler', () => {
  it('maps ZodError to 400 VALIDATION_ERROR with details and requestId', () => {
    const schema = z.object({ name: z.string().min(3) });
    let err: unknown;
    try {
      schema.parse({ name: 'x' });
    } catch (e) {
      err = e;
    }

    const res = makeRes();
    errorHandler(err as Error, makeReq(), res, vi.fn() as unknown as NextFunction);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.requestId).toBe('req-test');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('maps NotFoundError to 404 NOT_FOUND', () => {
    const res = makeRes();
    errorHandler(new NotFoundError('gone'), makeReq(), res, vi.fn() as unknown as NextFunction);

    expect(res.statusCode).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('maps ForbiddenError to 403 AUTHORIZATION_ERROR', () => {
    const res = makeRes();
    errorHandler(new ForbiddenError('nope'), makeReq(), res, vi.fn() as unknown as NextFunction);

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
  });

  it('maps generic AppError with its own status', () => {
    const res = makeRes();
    errorHandler(new AppError(418, 'IM_A_TEAPOT', 'teapot'), makeReq(), res, vi.fn() as unknown as NextFunction);
    expect(res.statusCode).toBe(418);
    expect(res.body.error.code).toBe('IM_A_TEAPOT');
  });

  it('maps unknown errors to 500 INTERNAL_ERROR', () => {
    const res = makeRes();
    errorHandler(new Error('boom'), makeReq(), res, vi.fn() as unknown as NextFunction);
    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.requestId).toBe('req-test');
  });

  // Regression: before this mapping, a stale DATABASE_URL (e.g. .env still
  // pointing at 5432 after docker-compose moved Postgres to 5434 in PR #9)
  // caused the demo login to 500 with "Unhandled server error", leaving
  // the developer with no clue what was wrong. The dedicated 503
  // DATABASE_UNAVAILABLE mapping gives them an actionable response.
  it('maps PrismaClientInitializationError to 503 DATABASE_UNAVAILABLE', () => {
    const err = new Prisma.PrismaClientInitializationError(
      "Can't reach database server at `localhost:5432`",
      '5.22.0',
      'P1001',
    );
    const res = makeRes();
    errorHandler(err, makeReq(), res, vi.fn() as unknown as NextFunction);
    expect(res.statusCode).toBe(503);
    expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(res.body.error.requestId).toBe('req-test');
  });
});
