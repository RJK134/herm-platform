/**
 * SCIM 2.0 router (Phase 11.11). RFC 7644 + RFC 7643 Users-only.
 *
 * Mount path: `/scim/v2/*` (NOT under `/api/*`). SCIM clients send
 * verbatim paths and the `application/scim+json` media type; namespacing
 * under `/api` would force every IdP integration to special-case HERM.
 *
 * Auth: `apiKeyAuth` is mounted globally on `/api/*` but NOT here.
 * We attach it locally so the SCIM surface inherits the same machine-
 * identity model. `requireScimAuth` then refuses anything that didn't
 * present a valid `Bearer herm_pk_…` with the `admin:scim` permission.
 */
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { apiKeyAuth } from '../../middleware/api-key-auth';
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

function requireScimAuth(req: Request, res: Response, next: NextFunction): void {
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

export function createScimRouter(): Router {
  const router = Router();

  router.use(apiKeyAuth);
  router.use(requireScimAuth);

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

  return router;
}
