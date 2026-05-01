/**
 * Static SCIM 2.0 service-discovery endpoints (RFC 7644 §4).
 *
 *   GET /scim/v2/ServiceProviderConfig    What this server supports
 *   GET /scim/v2/ResourceTypes            One-element list (User only for v1)
 *   GET /scim/v2/Schemas                  User schema only for v1
 *
 * No tenant scoping needed — these are open metadata about the server,
 * not data about tenants. They still require a valid API key (the
 * router applies the same auth chain) so unauthenticated probes don't
 * get to map our SCIM surface for free.
 */
import type { Request, Response } from 'express';
import { getSpBaseUrl } from '../../lib/sso-config';
import { USER_RESOURCE_SCHEMA } from './scim.mappers';

const SP_CONFIG_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig';
const RESOURCE_TYPE_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:ResourceType';
const SCHEMA_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Schema';

/**
 * Public base URL for SCIM `meta.location`. Sourced from `SP_BASE_URL`
 * env (the same trusted value SAML/OIDC use). Trusting `x-forwarded-*`
 * headers without `app.set('trust proxy', …)` configured would let a
 * direct caller spoof the URL; sourcing from env removes the surface.
 */
function baseUrl(_req: Request): string {
  return getSpBaseUrl();
}

export function serviceProviderConfig(req: Request, res: Response): void {
  res.type('application/scim+json').json({
    schemas: [SP_CONFIG_SCHEMA],
    documentationUri: 'https://docs.herm.com/scim',
    patch: { supported: false },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        // SCIM clients (Okta, Entra) use this to choose the right auth
        // strategy. The HERM scheme is `Authorization: Bearer herm_pk_…`,
        // which maps to the SCIM-standard `oauthbearertoken` type — NOT
        // `httpbasic` (that's the user:pass scheme, which we do not
        // implement).
        type: 'oauthbearertoken',
        name: 'HERM API Key (Bearer)',
        description: 'HERM API keys with admin:scim permission, sent as `Authorization: Bearer herm_pk_…`.',
        primary: true,
      },
    ],
    meta: { resourceType: 'ServiceProviderConfig', location: `${baseUrl(req)}/scim/v2/ServiceProviderConfig` },
  });
}

export function resourceTypes(req: Request, res: Response): void {
  const url = baseUrl(req);
  res.type('application/scim+json').json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 1,
    Resources: [
      {
        schemas: [RESOURCE_TYPE_SCHEMA],
        id: 'User',
        name: 'User',
        endpoint: '/Users',
        description: 'HERM platform user',
        schema: USER_RESOURCE_SCHEMA,
        meta: { resourceType: 'ResourceType', location: `${url}/scim/v2/ResourceTypes/User` },
      },
    ],
  });
}

export function schemas(req: Request, res: Response): void {
  const url = baseUrl(req);
  res.type('application/scim+json').json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 1,
    Resources: [
      {
        schemas: [SCHEMA_SCHEMA],
        id: USER_RESOURCE_SCHEMA,
        name: 'User',
        description: 'HERM User resource (subset of RFC 7643 §4.1)',
        attributes: [
          { name: 'userName', type: 'string', multiValued: false, required: true, mutability: 'readWrite', uniqueness: 'server' },
          { name: 'externalId', type: 'string', multiValued: false, required: false, mutability: 'readWrite', uniqueness: 'server' },
          {
            name: 'name',
            type: 'complex',
            multiValued: false,
            required: false,
            subAttributes: [
              { name: 'givenName', type: 'string' },
              { name: 'familyName', type: 'string' },
              { name: 'formatted', type: 'string' },
            ],
          },
          {
            name: 'emails',
            type: 'complex',
            multiValued: true,
            required: false,
            subAttributes: [
              { name: 'value', type: 'string', required: true },
              { name: 'primary', type: 'boolean' },
              { name: 'type', type: 'string' },
            ],
          },
          { name: 'active', type: 'boolean', multiValued: false, required: false },
        ],
        meta: { resourceType: 'Schema', location: `${url}/scim/v2/Schemas/${USER_RESOURCE_SCHEMA}` },
      },
    ],
  });
}
