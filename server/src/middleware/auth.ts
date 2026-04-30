import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { VendorJwtPayload } from '../api/vendor-portal/vendor-portal.service';

if (!process.env['JWT_SECRET']) {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  } else {
    console.warn('[AUTH] WARNING: JWT_SECRET not set — using insecure dev-secret. Set JWT_SECRET in .env');
  }
}

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret';

/**
 * The shape of a JWT in this platform. When `impersonator` is set, the
 * token represents an active customer-support impersonation session
 * (Phase 10.3): every middleware that checks `req.user.role` continues
 * to use the TARGET user's role (so the support engineer sees the
 * platform exactly as the customer would), but `audit()` and the auth
 * banner read `req.user.impersonator` to record who actually performed
 * the action and to keep the support engineer aware they are not
 * acting as themselves.
 */
export interface ImpersonatorClaim {
  userId: string;
  email: string;
  name: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  institutionId: string;
  institutionName: string;
  tier: string;
  /** Set when the bearer is impersonating; absent on normal sessions. */
  impersonator?: ImpersonatorClaim;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
      vendorUser?: VendorJwtPayload;
      frameworkId?: string;
    }
  }
}

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

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

export function optionalJWT(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
      // proceed as anonymous
    }
  }
  next();
}

export const optionalAuth = optionalJWT;

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

/**
 * Issue a short-lived impersonation token. The payload IS the target
 * user's payload (so role/tier/institution flow naturally through every
 * middleware), with an `impersonator` claim added so the audit pipeline
 * and the client banner know who really sent the request.
 *
 * The 1-hour expiry is deliberate — long enough for a support engineer
 * to reproduce a customer issue in a single session, short enough that
 * a forgotten or copy-pasted token can't sit in a terminal history
 * indefinitely.
 */
export function generateImpersonationToken(
  targetPayload: Omit<JwtPayload, 'impersonator'>,
  impersonator: ImpersonatorClaim,
): string {
  const payload: JwtPayload = { ...targetPayload, impersonator };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}
