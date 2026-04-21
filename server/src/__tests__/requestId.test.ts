import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requestId } from '../middleware/requestId';

function makeCtx(incomingHeader?: string) {
  const headers: Record<string, string | undefined> = {};
  if (incomingHeader) headers['x-request-id'] = incomingHeader;
  const req = {
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
  const setHeader = vi.fn();
  const res = { setHeader } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next, setHeader };
}

describe('requestId middleware', () => {
  it('generates a request id when none is provided', () => {
    const { req, res, next, setHeader } = makeCtx();
    requestId(req, res, next);

    expect(typeof req.id).toBe('string');
    expect(String(req.id).length).toBeGreaterThan(4);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', req.id);
    expect(next).toHaveBeenCalled();
  });

  it('honours a valid inbound x-request-id', () => {
    const { req, res, next, setHeader } = makeCtx('abc-123');
    requestId(req, res, next);

    expect(req.id).toBe('abc-123');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'abc-123');
    expect(next).toHaveBeenCalled();
  });

  it('rejects an over-long inbound request id and generates a fresh one', () => {
    const long = 'x'.repeat(200);
    const { req, res, next } = makeCtx(long);
    requestId(req, res, next);

    expect(req.id).not.toBe(long);
    expect(String(req.id).length).toBeLessThanOrEqual(64);
  });
});
