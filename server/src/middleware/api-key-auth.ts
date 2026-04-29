import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import prisma from '../utils/prisma';
import { logger } from '../lib/logger';

/**
 * API-key authentication.
 *
 * Phase 9 / Workstream B. Enterprise customers issue keys via `/api/keys` and
 * call read-only endpoints with `Authorization: Bearer herm_pk_…`. This
 * middleware:
 *
 *   1. Extracts the bearer token. If it doesn't start with `herm_pk_`, fall
 *      through unchanged — the JWT auth chain will handle it.
 *   2. Hashes the token with SHA-256 and looks up the matching `ApiKey` row.
 *   3. Validates that the row is active AND that `expiresAt`, if set, is in
 *      the future.
 *   4. Attaches `req.apiUser` with the key's id, institutionId, and
 *      permissions, plus an implied tier of `enterprise` (API access is
 *      enterprise-tier per HERM_COMPLIANCE.md).
 *   5. Updates `lastUsedAt` asynchronously — telemetry, not in the request
 *      critical path.
 *
 * Behaviour when the token starts with the API-key prefix but is invalid
 * (no match, expired, revoked): respond 401. We don't fall through to JWT
 * auth because the prefix is unambiguous — anything matching the format
 * MUST resolve to a real key or be rejected.
 *
 * `req.apiUser` is intentionally distinct from `req.user`. JWT users have a
 * full identity (email, role, etc.); API keys are machine identities scoped
 * to an institution + permission set.
 */

const API_KEY_PREFIX = 'herm_pk_';

export interface ApiUser {
  /** ApiKey.id */
  id: string;
  institutionId: string;
  permissions: string[];
  /** API access is always enterprise-tier per HERM_COMPLIANCE.md. */
  tier: 'enterprise';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiUser?: ApiUser;
    }
  }
}

function extractBearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

function hash(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Optional API-key middleware. If the request does not present a key in
 * the `herm_pk_…` format, this is a pass-through — caller can layer
 * `optionalJWT` / `authenticateJWT` after this. If the request DOES
 * present an API-key-shaped token, the middleware validates it and either
 * attaches `req.apiUser` or returns 401.
 */
export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractBearer(req);
  if (!token || !token.startsWith(API_KEY_PREFIX)) {
    next();
    return;
  }

  try {
    const keyHash = hash(token);
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      select: {
        id: true,
        institutionId: true,
        permissions: true,
        isActive: true,
        expiresAt: true,
      },
    });

    if (!apiKey || !apiKey.isActive) {
      res.status(401).json({
        success: false,
        error: { code: 'API_KEY_INVALID', message: 'API key is invalid or revoked.' },
      });
      return;
    }

    if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) {
      res.status(401).json({
        success: false,
        error: { code: 'API_KEY_EXPIRED', message: 'API key has expired.' },
      });
      return;
    }

    req.apiUser = {
      id: apiKey.id,
      institutionId: apiKey.institutionId,
      permissions: apiKey.permissions,
      tier: 'enterprise',
    };

    // Async fire-and-forget: update telemetry without blocking the request.
    // Failure here is logged but never blocks API access.
    prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch((err: unknown) => {
        logger.warn(
          { keyId: apiKey.id, err: err instanceof Error ? err.message : String(err) },
          'apiKeyAuth: failed to update lastUsedAt',
        );
      });

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Hard requirement: the endpoint must be reached via API-key auth AND the
 * key must hold the named permission (e.g. `read:systems`). For routes
 * that should ONLY be reachable via API key (e.g. machine-only surfaces).
 */
export function requireApiPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.apiUser) {
      res.status(401).json({
        success: false,
        error: { code: 'API_KEY_REQUIRED', message: 'This endpoint requires an API key.' },
      });
      return;
    }
    if (!req.apiUser.permissions.includes(permission)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'API_KEY_INSUFFICIENT_SCOPE',
          message: `API key is missing required permission: ${permission}`,
          details: { required: permission, granted: req.apiUser.permissions },
        },
      });
      return;
    }
    next();
  };
}
