/**
 * SCIM 2.0 router (Phase 11.11). RFC 7644 + RFC 7643 Users-only.
 *
 * Mount path: `/scim/v2/*` (NOT under `/api/*`). SCIM clients send
 * verbatim paths and the `application/scim+json` media type; namespacing
 * under `/api` would force every IdP integration to special-case HERM.
 *
 * Auth: `scimApiKeyAuth` mirrors `middleware/api-key-auth.ts` but emits
 * SCIM RFC 7644 §3.12 error envelopes on failure (the shared
 * `apiKeyAuth` returns the HERM `{success, error}` envelope, which
 * would break SCIM clients). `requireScimPermission` then enforces the
 * `admin:scim` permission on the resolved key.
 *
 * Errors thrown by handlers are caught by `scimErrorHandler` and
 * converted to SCIM-shaped responses, so a 500 from a Prisma hiccup
 * doesn't leak the HERM error envelope to a SCIM client.
 */
import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import { Router } from 'express';
import prisma from '../../utils/prisma';
import { logger } from '../../lib/logger';
import { sendScimError } from './scim.errors';
import {
  listUsers,
  getUser,
  createUser,
  replaceUser,
  deleteUser,
  patchUserNotImplemented,
} from './scim.users.controller';
import {
  serviceProviderConfig,
  resourceTypes,
  schemas,
} from './scim.config.controller';

const SCIM_PERMISSION = 'admin:scim';
const API_KEY_PREFIX = 'herm_pk_';

/**
 * SCIM-specific API key auth.
 *
 * Mirrors `middleware/api-key-auth.ts` behaviour but emits SCIM error
 * envelopes on failure. The shared middleware returns the HERM error
 * shape, which would break SCIM clients that parse responses by
 * `schemas: [...Error]`. Auth-success sets `req.apiUser` with the same
 * shape so the controllers do not need to distinguish.
 */
async function scimApiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token || !token.startsWith(API_KEY_PREFIX)) {
    sendScimError(res, { status: 401, detail: 'API key required' });
    return;
  }
  try {
    const keyHash = crypto.createHash('sha256').update(token).digest('hex');
    const apiKey = await prisma.apiKey.findUnique({ where: { keyHash } });
    if (
      !apiKey ||
      !apiKey.isActive ||
      (apiKey.expiresAt !== null && apiKey.expiresAt.getTime() < Date.now())
    ) {
      sendScimError(res, { status: 401, detail: 'API key invalid or expired' });
      return;
    }
    req.apiUser = {
      id: apiKey.id,
      institutionId: apiKey.institutionId,
      permissions: apiKey.permissions,
      tier: 'enterprise',
    };
    // Telemetry only — out of the request critical path.
    void prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    next();
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'scim api-key auth lookup failed',
    );
    sendScimError(res, { status: 401, detail: 'API key required' });
  }
}

function requireScimPermission(req: Request, res: Response, next: NextFunction): void {
  if (!req.apiUser) {
    sendScimError(res, { status: 401, detail: 'API key required' });
    return;
  }
  if (!req.apiUser.permissions.includes(SCIM_PERMISSION)) {
    sendScimError(res, {
      status: 403,
      detail: `API key missing required permission: ${SCIM_PERMISSION}`,
    });
    return;
  }
  next();
}

/**
 * SCIM-shaped error middleware. Wrapped controllers that throw or call
 * `next(err)` would otherwise bubble to the app-level error handler,
 * which emits the HERM error envelope and breaks SCIM clients. This
 * middleware catches everything inside the SCIM mount and reformats.
 *
 * Express recognises this as an error handler via the 4-arg signature.
 */
function scimErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    'scim handler unhandled error',
  );
  sendScimError(res, {
    status: 500,
    detail: 'Internal server error',
  });
}

export function createScimRouter(): Router {
  const router = Router();

  router.use(scimApiKeyAuth);
  router.use(requireScimPermission);

  // Service-discovery endpoints
  router.get('/ServiceProviderConfig', serviceProviderConfig);
  router.get('/ResourceTypes', resourceTypes);
  router.get('/Schemas', schemas);

  // Users resource
  router.get('/Users', listUsers);
  router.get('/Users/:id', getUser);
  router.post('/Users', createUser);
  router.put('/Users/:id', replaceUser);
  router.patch('/Users/:id', patchUserNotImplemented);
  router.delete('/Users/:id', deleteUser);

  // Anything else under /scim/v2 — unsupported resource. Return a SCIM
  // 404 instead of falling through to the generic 404 handler.
  router.use((_req, res) => {
    sendScimError(res, { status: 404, detail: 'Unknown SCIM resource' });
  });

  // SCIM-shaped error envelope for anything thrown by handlers.
  router.use(scimErrorHandler);

  return router;
}
