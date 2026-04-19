import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

const HEADER = 'x-request-id';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

/**
 * Assigns a stable request ID to every request:
 * - Reuses an incoming `x-request-id` header if present (so upstream tracing
 *   is preserved when a proxy or load balancer injects one).
 * - Otherwise generates a UUID v4.
 * - Echoes the header back on the response so callers can correlate logs.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[HEADER];
  const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
  req.id = id;
  res.setHeader(HEADER, id);
  next();
}
