/**
 * OpenAPI 3.1 specification for the HERM Platform public API (Phase 10.4).
 *
 * Hand-curated rather than generated. Reasons:
 *   - We don't yet have decorators or a tsoa/zod-openapi pipeline; bolting
 *     one on touches every controller and every Zod schema, which is a
 *     much larger lift than the value of fully automatic coverage.
 *   - Enterprise integrators want a stable contract to point their
 *     codegen / API gateway at — they don't care whether it's generated.
 *   - This file only describes the surfaces customers actually integrate
 *     against; internal admin / vendor-portal / framework-mappings paths
 *     are deliberately omitted. As those mature, the spec grows.
 *
 * The shape is OpenAPI 3.1.0 and validates against the spec at
 * https://spec.openapis.org/oas/3.1.0. We don't pull the official
 * `openapi-types` package because it adds a runtime/type-only dependency
 * for one file; instead this module exports a hand-typed object whose
 * shape is documented inline.
 */

const TITLE = 'HERM Platform API';
const VERSION = '1.0.0';
const DESCRIPTION =
  'Public REST API for the HERM Procurement & Capability Intelligence Platform. ' +
  'Authentication is JWT-bearer for end-user requests; API-key bearer (`herm_pk_…`) ' +
  'for machine-to-machine integrations. Every response uses the envelope ' +
  '`{ success, data?, error? }` — a successful response carries `data`, an ' +
  'error response carries `error: { code, message, requestId }`.';

const ERROR_RESPONSES = {
  '400': { description: 'Validation error.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
  '401': { description: 'Authentication required or token invalid.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
  '403': { description: 'Authenticated but not authorised for this resource.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
  '404': { description: 'Resource not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
  '429': { description: 'Rate-limit ceiling reached for the caller\'s tier.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
  '500': { description: 'Internal server error.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
} as const;

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: TITLE,
    version: VERSION,
    description: DESCRIPTION,
    contact: {
      name: 'HERM Platform Support',
      url: 'https://github.com/RJK134/herm-platform',
    },
    license: {
      name: 'Proprietary — see LICENSE',
    },
  },
  servers: [
    { url: '/api/v1', description: 'Versioned base. Stable contract — breaking changes ship as /api/v2.' },
    { url: '/api', description: 'Unversioned alias of the latest stable version. May change without notice — versioned base preferred.' },
  ],
  tags: [
    { name: 'Auth', description: 'Registration, login, profile, logout.' },
    { name: 'Capabilities', description: 'Read the HERM v3.1 capability catalogue (165 capabilities across 5 domains).' },
    { name: 'Systems', description: 'Read the curated vendor system catalogue.' },
    { name: 'Scores', description: 'Capability-by-system scores; the platform\'s evidence base.' },
    { name: 'Baskets', description: 'Per-institution capability baskets (stored, used to drive scoring + procurement).' },
    { name: 'Procurement', description: 'Procurement projects + ITT generation.' },
    { name: 'Sector analytics', description: 'Anonymous sector-level cross-cuts. Self-exclusion + k-anonymity floor enforced.' },
    { name: 'Subscriptions', description: 'Stripe-backed billing + subscription state.' },
    { name: 'Health', description: 'Liveness + readiness probes.' },
  ],
  components: {
    securitySchemes: {
      BearerJWT: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'End-user JWT issued by /auth/login or /auth/register. Carries `userId`, `role`, `tier`, `institutionId`. Default expiry 7 days.',
      },
      ApiKey: {
        type: 'http',
        scheme: 'bearer',
        description: 'Machine-to-machine bearer key in the form `herm_pk_…`. Created via /api/keys. Rate-limit ceiling is per-key.',
      },
    },
    schemas: {
      ErrorEnvelope: {
        type: 'object',
        required: ['success', 'error'],
        properties: {
          success: { type: 'boolean', enum: [false] },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string' },
              requestId: { type: 'string', description: 'Correlates with X-Request-Id response header and structured logs.' },
              details: { description: 'Optional structured detail (e.g. field-level Zod issues).' },
            },
          },
        },
      },
      SuccessEnvelope: {
        type: 'object',
        required: ['success'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          data: { description: 'Endpoint-specific payload.' },
        },
      },
      User: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['SUPER_ADMIN', 'INSTITUTION_ADMIN', 'EVALUATOR', 'VIEWER'] },
          institutionId: { type: 'string' },
          institutionName: { type: 'string' },
          tier: { type: 'string', enum: ['free', 'professional', 'enterprise'] },
        },
      },
      AuthResponse: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          data: {
            type: 'object',
            properties: {
              token: { type: 'string', description: 'Bearer JWT.' },
              user: { $ref: '#/components/schemas/User' },
            },
          },
        },
      },
      RegisterInput: {
        type: 'object',
        required: ['email', 'password', 'name', 'institutionName'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          name: { type: 'string', minLength: 1 },
          institutionName: { type: 'string', minLength: 1 },
        },
      },
      LoginInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      Capability: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          code: { type: 'string', description: 'Stable HERM code, e.g. "1.1.1".' },
          name: { type: 'string' },
          description: { type: 'string' },
          domain: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
        },
      },
      VendorSystem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          vendor: { type: 'string' },
          category: { type: 'string' },
        },
      },
      SectorOverview: {
        type: 'object',
        properties: {
          institutions: { type: 'integer', description: 'Excludes the caller\'s own institution.' },
          evaluations: { type: 'integer' },
          procurements: { type: 'integer' },
          topSystems: { type: 'array', items: { $ref: '#/components/schemas/VendorSystem' } },
          topCapabilities: { type: 'array', items: { type: 'object' } },
        },
      },
      HealthStatus: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'degraded'] },
          uptime: { type: 'number' },
          version: { type: 'string' },
        },
      },
      ReadinessStatus: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          checks: {
            type: 'object',
            properties: {
              database: { type: 'object', properties: { ok: { type: 'boolean' }, lastError: { type: 'string', nullable: true } } },
              stripe: { type: 'object', properties: { ok: { type: 'boolean' }, lastError: { type: 'string', nullable: true } } },
            },
          },
        },
      },
    },
  },
  // Top-level security default — every operation requires BearerJWT unless
  // it overrides with `security: []` (anonymous) or another scheme.
  security: [{ BearerJWT: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe — process is up.',
        security: [],
        responses: {
          '200': {
            description: 'Live.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['success', 'data'],
                  properties: {
                    success: { type: 'boolean', const: true },
                    data: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['status', 'timestamp', 'version'],
                      properties: {
                        status: { type: 'string', example: 'ok' },
                        timestamp: { type: 'string', format: 'date-time' },
                        version: { type: 'string', example: '1.0.0' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness probe — DB + critical dependencies.',
        security: [],
        responses: {
          '200': {
            description: 'Ready.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['success', 'data'],
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['status', 'checks', 'timestamp'],
                      properties: {
                        status: { type: 'string', enum: ['ready', 'not_ready'] },
                        checks: {
                          type: 'object',
                          additionalProperties: false,
                          required: ['database', 'db'],
                          properties: {
                            database: { type: 'boolean' },
                            db: { type: 'boolean' },
                            stripe: { type: 'boolean' },
                          },
                        },
                        timestamp: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
          '503': {
            description: 'One or more critical dependencies are failing.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['success', 'data'],
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['status', 'checks', 'timestamp'],
                      properties: {
                        status: { type: 'string', enum: ['ready', 'not_ready'] },
                        checks: {
                          type: 'object',
                          additionalProperties: false,
                          required: ['database', 'db'],
                          properties: {
                            database: { type: 'boolean' },
                            db: { type: 'boolean' },
                            stripe: { type: 'boolean' },
                          },
                        },
                        timestamp: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create a new institution + admin user.',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterInput' } } } },
        responses: {
          '201': { description: 'Created.', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          '400': ERROR_RESPONSES['400'],
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Exchange email + password for a bearer JWT.',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' } } } },
        responses: {
          '200': { description: 'OK.', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          '401': ERROR_RESPONSES['401'],
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Return the authenticated user\'s profile + tier.',
        responses: {
          '200': {
            description: 'OK.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      allOf: [
                        { $ref: '#/components/schemas/User' },
                        {
                          type: 'object',
                          properties: {
                            subscription: {
                              type: 'object',
                              description: 'Authenticated user subscription/tier details.',
                              additionalProperties: true,
                            },
                            institution: {
                              type: 'object',
                              description: 'Institution associated with the authenticated user.',
                              additionalProperties: true,
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          '401': ERROR_RESPONSES['401'],
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Server-side audit-log of session end. Token invalidation is client-side.',
        responses: {
          '200': { description: 'OK.' },
          '401': ERROR_RESPONSES['401'],
        },
      },
    },
    '/capabilities': {
      get: {
        tags: ['Capabilities'],
        summary: 'List capabilities in the active framework.',
        parameters: [
          { in: 'query', name: 'framework', schema: { type: 'string' }, description: 'Override the default framework via query param.' },
        ],
        responses: {
          '200': { description: 'OK.', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/Capability' } } } } } } },
          '401': ERROR_RESPONSES['401'],
          '429': ERROR_RESPONSES['429'],
        },
      },
    },
    '/systems': {
      get: {
        tags: ['Systems'],
        summary: 'List vendor systems.',
        responses: {
          '200': { description: 'OK.', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/VendorSystem' } } } } } } },
          '401': ERROR_RESPONSES['401'],
        },
      },
    },
    '/scores': {
      get: {
        tags: ['Scores'],
        summary: 'List capability-by-system scores.',
        responses: {
          '200': { description: 'OK.' },
          '401': ERROR_RESPONSES['401'],
        },
      },
    },
    '/baskets': {
      get: {
        tags: ['Baskets'],
        summary: 'List baskets owned by the caller\'s institution.',
        responses: {
          '200': { description: 'OK.' },
          '401': ERROR_RESPONSES['401'],
        },
      },
      post: {
        tags: ['Baskets'],
        summary: 'Create a new basket.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } } } } },
        responses: {
          '201': { description: 'Created.' },
          '400': ERROR_RESPONSES['400'],
          '401': ERROR_RESPONSES['401'],
        },
      },
    },
    '/sector/analytics/overview': {
      get: {
        tags: ['Sector analytics'],
        summary: 'Sector-wide aggregate overview. Tier ≥ professional.',
        description: 'Excludes the caller\'s own institution from every count. Returns empty leaderboards when fewer than 5 OTHER institutions exist on the platform (k-anonymity floor).',
        responses: {
          '200': { description: 'OK.', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/SectorOverview' } } } } } },
          '401': ERROR_RESPONSES['401'],
          '403': ERROR_RESPONSES['403'],
        },
      },
    },
    '/subscriptions/checkout': {
      post: {
        tags: ['Subscriptions'],
        summary: 'Initiate a Stripe Checkout Session for a subscription tier.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['tier'], properties: { tier: { type: 'string', enum: ['institutionProfessional', 'institutionEnterprise'] } } } } } },
        responses: {
          '200': { description: 'OK.', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { url: { type: 'string' } } } } } } } },
          '401': ERROR_RESPONSES['401'],
          '500': ERROR_RESPONSES['500'],
        },
      },
    },
  },
} as const;
