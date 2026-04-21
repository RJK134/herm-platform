import type { Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';

const HEADER = 'x-request-id';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(HEADER);
  const id = typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 64
    ? incoming
    : nanoid();
  req.id = id;
  res.setHeader(HEADER, id);
  next();
}
