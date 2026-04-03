import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

// Fail fast at startup if JWT_SECRET is not configured — prevents forged tokens
if (!process.env['JWT_SECRET']) {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  } else {
    console.warn('[AUTH] WARNING: JWT_SECRET not set — using insecure dev-secret. Set JWT_SECRET in .env');
  }
}

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret';

export interface JwtPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  institutionId: string;
  institutionName: string;
  tier: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

/** Requires a valid JWT — 401 if missing/invalid */
export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({
      success: false,
      error: { code: 'AUTHENTICATION_ERROR', message: 'Authentication token required' },
    });
    return;
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET) as JwtPayload;
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid or expired token' },
    });
  }
}

/** Attaches user if JWT present but does NOT fail if missing */
export function optionalJWT(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
      // Ignore — proceed as anonymous
    }
  }
  next();
}

/** Legacy alias used by existing routes */
export const optionalAuth = optionalJWT;

/** Requires authenticated user with one of the given roles */
export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'AUTHENTICATION_ERROR', message: 'Authentication required' },
      });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'AUTHORIZATION_ERROR',
          message: `Role '${req.user.role}' cannot perform this action`,
        },
      });
      return;
    }
    next();
  };
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
