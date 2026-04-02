import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
    }
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Phase 1: pass-through with anonymous user
    // In production, verify the JWT here
    req.user = { id: 'anonymous', role: 'VIEWER' };
  } else {
    req.user = { id: 'anonymous', role: 'VIEWER' };
  }
  next();
}
