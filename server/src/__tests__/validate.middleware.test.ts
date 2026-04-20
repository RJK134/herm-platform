import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { validate, validateBody } from '../middleware/validate';

function makeCtx(body: unknown = {}, query: unknown = {}, params: unknown = {}) {
  const req = { body, query, params } as unknown as Request;
  const res = {} as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe('validate middleware', () => {
  it('parses and replaces body on success', () => {
    const schema = z.object({ name: z.string().min(2) });
    const mw = validateBody(schema);
    const { req, res, next } = makeCtx({ name: 'Alice' });

    mw(req, res, next);

    expect(req.body).toEqual({ name: 'Alice' });
    expect(next).toHaveBeenCalledWith();
  });

  it('forwards ZodError to next() on invalid input', () => {
    const schema = z.object({ name: z.string().min(2) });
    const mw = validateBody(schema);
    const { req, res, next } = makeCtx({ name: 'A' });

    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(arg).toBeInstanceOf(Error);
  });

  it('combined validate() parses body + query + params', () => {
    const spec = {
      body: z.object({ a: z.number() }),
      query: z.object({ q: z.string() }),
      params: z.object({ id: z.string() }),
    };
    const mw = validate(spec);
    const { req, res, next } = makeCtx({ a: 1 }, { q: 'hi' }, { id: 'x' });

    mw(req, res, next);

    expect(req.body).toEqual({ a: 1 });
    expect(req.query).toEqual({ q: 'hi' });
    expect(req.params).toEqual({ id: 'x' });
    expect(next).toHaveBeenCalledWith();
  });
});
