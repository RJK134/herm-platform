/**
 * Phase 11.11 — SCIM 2.0 provisioning tests.
 *
 * Exercises the full HTTP surface (`/scim/v2/*`) through supertest with
 * a mocked Prisma client. Covers RFC 7644 conformance basics:
 *   - Auth gate (no key → 401, key without admin:scim → 403)
 *   - Service-discovery endpoints (ServiceProviderConfig, ResourceTypes, Schemas)
 *   - GET /Users + filter
 *   - GET /Users/:id (self-tenant only)
 *   - POST /Users (creation + uniqueness conflict + cross-institution probe)
 *   - PUT /Users/:id (replace + email change uniqueness)
 *   - DELETE /Users/:id (soft-delete via deletedAt + PII scrub)
 *   - PATCH /Users/:id (501 Not Implemented)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { userMocks, apiKeyFindUniqueMock, apiKeyUpdateMock, auditLogCreateMock } = vi.hoisted(
  () => ({
    userMocks: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    apiKeyFindUniqueMock: vi.fn(),
    apiKeyUpdateMock: vi.fn(),
    auditLogCreateMock: vi.fn(),
  }),
);

vi.mock('../utils/prisma', () => ({
  default: {
    user: userMocks,
    apiKey: { findUnique: apiKeyFindUniqueMock, update: apiKeyUpdateMock },
    auditLog: { create: auditLogCreateMock },
  },
}));

import { createScimRouter, _resetScimNegativeCacheForTests } from '../api/scim/scim.router';

const TEST_INSTITUTION_ID = 'inst-acme';
const OTHER_INSTITUTION_ID = 'inst-other';
const VALID_KEY = 'herm_pk_validkey0000000000000000000000000000000000000000';
const INVALID_KEY = 'herm_pk_invalid000000000000000000000000000000000000000000';

function buildApp(): express.Express {
  const app = express();
  // Mirror app.ts so SCIM clients sending `application/scim+json`
  // (Okta, Entra, OneLogin per RFC 7644) get parsed properly.
  app.use(express.json({ type: ['application/json', 'application/scim+json'] }));
  app.use('/scim/v2', createScimRouter());
  return app;
}

function fakeUser(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'usr-1',
    email: 'alice@acme.test',
    name: 'Alice Anderson',
    institutionId: TEST_INSTITUTION_ID,
    externalId: null,
    deletedAt: null,
    passwordHash: '',
    passwordLoginDisabled: true,
    mfaSecret: null,
    mfaEnabledAt: null,
    role: 'VIEWER',
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function authedKey(
  permissions: string[] = ['admin:scim'],
  over: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'key-1',
    institutionId: TEST_INSTITUTION_ID,
    permissions,
    isActive: true,
    expiresAt: null,
    // Phase 11.15 (H3) — the SCIM auth chokepoint joins `institution`
    // and refuses on `institution.deletedAt !== null`. Existing tests
    // assume a live tenant, so the helper defaults `deletedAt: null`.
    institution: { deletedAt: null },
    ...over,
  };
}

beforeEach(() => {
  Object.values(userMocks).forEach((m) => m.mockReset());
  apiKeyFindUniqueMock.mockReset();
  apiKeyUpdateMock.mockReset();
  auditLogCreateMock.mockReset();
  // apiKeyAuth's "telemetry" lastUsedAt update should resolve cleanly.
  apiKeyUpdateMock.mockResolvedValue({});
  auditLogCreateMock.mockResolvedValue({});
  // Phase 11.15 (M1) — clear the SCIM negative-auth cache between
  // tests so a previous "no row" lookup doesn't short-circuit later
  // tests that mock a different return.
  _resetScimNegativeCacheForTests();
});

describe('SCIM auth gate', () => {
  it('401 when no Authorization header', async () => {
    const res = await request(buildApp()).get('/scim/v2/Users');
    expect(res.status).toBe(401);
    expect(res.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:Error');
  });

  it('401 when bearer is API-key-shaped but unknown', async () => {
    apiKeyFindUniqueMock.mockResolvedValue(null);
    const res = await request(buildApp())
      .get('/scim/v2/Users')
      .set('Authorization', `Bearer ${INVALID_KEY}`);
    expect(res.status).toBe(401);
  });

  it('403 when the key lacks admin:scim permission', async () => {
    apiKeyFindUniqueMock.mockResolvedValue(authedKey(['read:systems']));
    const res = await request(buildApp())
      .get('/scim/v2/Users')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(res.status).toBe(403);
    expect(res.body.detail).toContain('admin:scim');
  });
});

describe('SCIM service-discovery', () => {
  beforeEach(() => {
    apiKeyFindUniqueMock.mockResolvedValue(authedKey());
  });

  it('GET /ServiceProviderConfig returns the SP-config schema', async () => {
    const res = await request(buildApp())
      .get('/scim/v2/ServiceProviderConfig')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.schemas).toContain(
      'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
    );
    expect(res.body.patch.supported).toBe(false);
    expect(res.body.filter.supported).toBe(true);
  });

  it('GET /ResourceTypes lists User only for v1', async () => {
    const res = await request(buildApp())
      .get('/scim/v2/ResourceTypes')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(1);
    expect(res.body.Resources[0].id).toBe('User');
  });

  it('GET /Schemas returns the User schema', async () => {
    const res = await request(buildApp())
      .get('/scim/v2/Schemas')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.Resources[0].name).toBe('User');
  });
});

describe('GET /scim/v2/Users', () => {
  beforeEach(() => {
    apiKeyFindUniqueMock.mockResolvedValue(authedKey());
  });

  it('lists active users in the caller institution only', async () => {
    userMocks.count.mockResolvedValue(2);
    userMocks.findMany.mockResolvedValue([
      fakeUser({ id: 'usr-1' }),
      fakeUser({ id: 'usr-2', email: 'bob@acme.test' }),
    ]);
    const res = await request(buildApp())
      .get('/scim/v2/Users')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(2);
    expect(res.body.Resources).toHaveLength(2);
    // The where clause must scope on institutionId; the mock receives it
    expect(userMocks.findMany.mock.calls[0]?.[0]?.where?.institutionId).toBe(TEST_INSTITUTION_ID);
  });

  it('filter `userName eq "alice@acme.test"` translates to email lookup', async () => {
    userMocks.count.mockResolvedValue(1);
    userMocks.findMany.mockResolvedValue([fakeUser()]);
    const res = await request(buildApp())
      .get('/scim/v2/Users?filter=userName eq "alice@acme.test"')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(res.status).toBe(200);
    expect(userMocks.findMany.mock.calls[0]?.[0]?.where?.email).toBe('alice@acme.test');
  });

  it('rejects unsupported filter shapes with 400 invalidFilter', async () => {
    const res = await request(buildApp())
      .get('/scim/v2/Users?filter=name.givenName co "Al"')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(res.status).toBe(400);
    expect(res.body.scimType).toBe('invalidFilter');
  });

  it('count=0 returns zero resources but the totalResults header (RFC 7644 §3.4.2.4)', async () => {
    userMocks.count.mockResolvedValue(42);
    userMocks.findMany.mockResolvedValue([]);
    const res = await request(buildApp())
      .get('/scim/v2/Users?count=0')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(42);
    expect(res.body.Resources).toEqual([]);
    // The Prisma findMany is called with `take: 0`, not the default cap.
    expect(userMocks.findMany.mock.calls[0]?.[0]?.take).toBe(0);
  });
});

describe('GET /scim/v2/Users/:id', () => {
  beforeEach(() => {
    apiKeyFindUniqueMock.mockResolvedValue(authedKey());
  });

  it('200 with the SCIM user when the row is in the caller institution', async () => {
    userMocks.findFirst.mockResolvedValue(fakeUser());
    const res = await request(buildApp())
      .get('/scim/v2/Users/usr-1')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.userName).toBe('alice@acme.test');
    expect(res.body.active).toBe(true);
    expect(res.body.meta.resourceType).toBe('User');
  });

  it('404 when the row exists in a different institution', async () => {
    userMocks.findFirst.mockResolvedValue(null);
    const res = await request(buildApp())
      .get('/scim/v2/Users/usr-other')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(res.status).toBe(404);
    expect(res.body.detail).toMatch(/not found/i);
  });
});

describe('POST /scim/v2/Users', () => {
  beforeEach(() => {
    apiKeyFindUniqueMock.mockResolvedValue(authedKey());
  });

  it('201 creates a new user with passwordLoginDisabled and SCIM-derived email/name', async () => {
    userMocks.findUnique.mockResolvedValue(null); // no existing email
    userMocks.create.mockResolvedValue(
      fakeUser({ id: 'usr-new', email: 'carol@acme.test', name: 'Carol Carter' }),
    );
    const res = await request(buildApp())
      .post('/scim/v2/Users')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'carol@acme.test',
        name: { givenName: 'Carol', familyName: 'Carter' },
        emails: [{ value: 'carol@acme.test', primary: true }],
        active: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.userName).toBe('carol@acme.test');
    const createArgs = userMocks.create.mock.calls[0]?.[0]?.data;
    expect(createArgs?.institutionId).toBe(TEST_INSTITUTION_ID);
    expect(createArgs?.passwordLoginDisabled).toBe(true);
    expect(createArgs?.passwordHash).toBe('');
    expect(auditLogCreateMock).toHaveBeenCalled();
  });

  it('409 with scimType=uniqueness when userName already exists (cross-institution case included)', async () => {
    userMocks.findUnique.mockResolvedValue(fakeUser({ institutionId: OTHER_INSTITUTION_ID }));
    const res = await request(buildApp())
      .post('/scim/v2/Users')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .send({
        userName: 'collision@acme.test',
        emails: [{ value: 'collision@acme.test', primary: true }],
      });
    expect(res.status).toBe(409);
    expect(res.body.scimType).toBe('uniqueness');
    expect(userMocks.create).not.toHaveBeenCalled();
  });

  it('400 when schema validation fails (userName missing)', async () => {
    const res = await request(buildApp())
      .post('/scim/v2/Users')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .send({ name: { givenName: 'Nope' } });
    expect(res.status).toBe(400);
    expect(res.body.scimType).toBe('invalidSyntax');
  });

  it('400 invalidSyntax when userName is not a valid email', async () => {
    const res = await request(buildApp())
      .post('/scim/v2/Users')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .send({ userName: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.scimType).toBe('invalidSyntax');
  });

  it('400 invalidValue when active=false on create', async () => {
    userMocks.findUnique.mockResolvedValue(null);
    const res = await request(buildApp())
      .post('/scim/v2/Users')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .send({
        userName: 'disabled@acme.test',
        active: false,
      });
    expect(res.status).toBe(400);
    expect(res.body.scimType).toBe('invalidValue');
    expect(userMocks.create).not.toHaveBeenCalled();
  });

  it('parses application/scim+json content type (RFC 7644 §3.1)', async () => {
    userMocks.findUnique.mockResolvedValue(null);
    userMocks.create.mockResolvedValue(fakeUser({ email: 'real-idp@acme.test', name: 'Real IdP' }));
    // Real SCIM clients (Okta, Entra) send Content-Type: application/scim+json.
    // Without the type override on express.json(), req.body would be undefined
    // and the controller's Zod parse would 400 invalidSyntax.
    const res = await request(buildApp())
      .post('/scim/v2/Users')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .set('Content-Type', 'application/scim+json')
      .send(
        JSON.stringify({
          userName: 'real-idp@acme.test',
          emails: [{ value: 'real-idp@acme.test', primary: true }],
        }),
      );
    expect(res.status).toBe(201);
    expect(res.body.userName).toBe('real-idp@acme.test');
    expect(userMocks.create).toHaveBeenCalled();
  });
});

describe('PUT /scim/v2/Users/:id', () => {
  beforeEach(() => {
    apiKeyFindUniqueMock.mockResolvedValue(authedKey());
  });

  it('200 replaces the row when the email is unchanged', async () => {
    userMocks.findFirst.mockResolvedValue(fakeUser());
    userMocks.update.mockResolvedValue(fakeUser({ name: 'Alice Updated' }));
    const res = await request(buildApp())
      .put('/scim/v2/Users/usr-1')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .send({
        userName: 'alice@acme.test',
        name: { givenName: 'Alice', familyName: 'Updated' },
        emails: [{ value: 'alice@acme.test', primary: true }],
        active: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.userName).toBe('alice@acme.test');
  });

  it('active=false transitions a live row to soft-deleted with PII scrub', async () => {
    userMocks.findFirst.mockResolvedValue(fakeUser());
    const stamped = new Date();
    userMocks.update.mockResolvedValue(fakeUser({ deletedAt: stamped }));
    const res = await request(buildApp())
      .put('/scim/v2/Users/usr-1')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .send({
        userName: 'alice@acme.test',
        emails: [{ value: 'alice@acme.test', primary: true }],
        active: false,
      });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    const updateArgs = userMocks.update.mock.calls[0]?.[0]?.data;
    expect(updateArgs?.deletedAt).toBeInstanceOf(Date);
    // Now: PII scrub matches DELETE / GDPR semantics
    expect(updateArgs?.email).toMatch(/^deleted\+.*@deleted\.invalid$/);
    expect(updateArgs?.name).toBe('[deleted user]');
    expect(updateArgs?.passwordHash).toBe('');
    expect(updateArgs?.mfaSecret).toBeNull();
  });

  it('404 when targeting a soft-deleted row (PUT cannot restore PII over a tombstone)', async () => {
    // The PUT lookup filters deletedAt: null to prevent silently
    // restoring scrubbed PII over a tombstoned row. Soft-deleted users
    // are invisible to PUT, mirroring GET / DELETE behaviour.
    userMocks.findFirst.mockResolvedValue(null);
    const res = await request(buildApp())
      .put('/scim/v2/Users/usr-deleted')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .send({
        userName: 'alice@acme.test',
        emails: [{ value: 'alice@acme.test', primary: true }],
        active: true,
      });
    expect(res.status).toBe(404);
    expect(userMocks.update).not.toHaveBeenCalled();
  });

  it('409 when changing userName to one already registered', async () => {
    userMocks.findFirst.mockResolvedValue(fakeUser());
    userMocks.findUnique.mockResolvedValue(fakeUser({ id: 'usr-2', email: 'taken@acme.test' }));
    const res = await request(buildApp())
      .put('/scim/v2/Users/usr-1')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .send({
        userName: 'taken@acme.test',
        emails: [{ value: 'taken@acme.test', primary: true }],
      });
    expect(res.status).toBe(409);
    expect(res.body.scimType).toBe('uniqueness');
  });
});

describe('DELETE /scim/v2/Users/:id', () => {
  beforeEach(() => {
    apiKeyFindUniqueMock.mockResolvedValue(authedKey());
  });

  it('204 soft-deletes and scrubs PII (deterministic tombstone email + externalId cleared)', async () => {
    userMocks.findFirst.mockResolvedValue(
      fakeUser({ id: 'usr-target', externalId: 'idp-side-id-42' }),
    );
    userMocks.update.mockResolvedValue(fakeUser({ deletedAt: new Date() }));
    const res = await request(buildApp())
      .delete('/scim/v2/Users/usr-1')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(res.status).toBe(204);
    const updateArgs = userMocks.update.mock.calls[0]?.[0]?.data;
    expect(updateArgs?.deletedAt).toBeInstanceOf(Date);
    // Deterministic GDPR-aligned tombstone — no `:` characters.
    expect(updateArgs?.email).toBe('deleted+usr-target@deleted.invalid');
    expect(updateArgs?.name).toBe('[deleted user]');
    expect(updateArgs?.passwordHash).toBe('');
    expect(updateArgs?.mfaSecret).toBeNull();
    // externalId cleared so a SCIM delete-then-re-provision with the
    // same externalId is not blocked by the composite unique index.
    expect(updateArgs?.externalId).toBeNull();
  });

  it('404 when the user is in a different institution', async () => {
    userMocks.findFirst.mockResolvedValue(null);
    const res = await request(buildApp())
      .delete('/scim/v2/Users/usr-other')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /scim/v2/Users/:id', () => {
  beforeEach(() => {
    apiKeyFindUniqueMock.mockResolvedValue(authedKey());
  });

  it('501 — PATCH is not implemented in v1', async () => {
    const res = await request(buildApp())
      .patch('/scim/v2/Users/usr-1')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .send({ Operations: [{ op: 'replace', path: 'active', value: false }] });
    expect(res.status).toBe(501);
  });
});

// Phase 11.15 (H3) — SCIM provisioning into a soft-deleted Institution.
//
// When an Institution is soft-deleted via the cascade in
// `services/retention/cascade.ts`, the Institution row is stamped
// `deletedAt` immediately but the linked `ApiKey` rows survive until
// the retention scheduler hard-deletes the Institution at the end of
// the grace window (typically `RETENTION_GRACE_DAYS=30`). Without an
// explicit check at the SCIM auth chokepoint, the bearer would
// continue to authorise and provisioning would write new User rows
// into a tombstoned tenant — which the retention sweeper then reaps
// silently, leaving an audit trail of bogus provisions.
//
// The fix mirrors the JWT chokepoint pattern in `middleware/auth.ts`
// that already gates on `User.institution.deletedAt`. Refusing here
// must surface the same opaque "invalid token" 401 that
// `apiKeyFindUnique` returning `null` does — anything more specific
// would let an outside SCIM client confirm a tenant exists.
describe('SCIM auth gate — H3 tenant-deletion check', () => {
  it('401 with the standard SCIM error envelope when the parent Institution is soft-deleted', async () => {
    apiKeyFindUniqueMock.mockResolvedValue(
      authedKey(['admin:scim'], { institution: { deletedAt: new Date('2026-04-15T00:00:00Z') } }),
    );
    const res = await request(buildApp())
      .get('/scim/v2/Users')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(res.status).toBe(401);
    expect(res.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:Error');
    // Opaque envelope — must not confirm tenant existence.
    expect(res.body.detail).toMatch(/api key/i);
  });

  it('401 on POST /Users into a soft-deleted tenant — no User row is created', async () => {
    apiKeyFindUniqueMock.mockResolvedValue(
      authedKey(['admin:scim'], { institution: { deletedAt: new Date() } }),
    );
    const res = await request(buildApp())
      .post('/scim/v2/Users')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .send({
        userName: 'rejected@acme.test',
        emails: [{ value: 'rejected@acme.test', primary: true }],
        active: true,
      });
    expect(res.status).toBe(401);
    expect(userMocks.create).not.toHaveBeenCalled();
    // Audit row for a bogus provision must NOT be written.
    expect(auditLogCreateMock).not.toHaveBeenCalled();
  });

  it('401 on PUT /Users/:id (replace) when the parent Institution is soft-deleted', async () => {
    apiKeyFindUniqueMock.mockResolvedValue(
      authedKey(['admin:scim'], { institution: { deletedAt: new Date() } }),
    );
    const res = await request(buildApp())
      .put('/scim/v2/Users/usr-1')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .send({
        userName: 'alice@acme.test',
        emails: [{ value: 'alice@acme.test', primary: true }],
        active: true,
      });
    expect(res.status).toBe(401);
    expect(userMocks.update).not.toHaveBeenCalled();
  });

  it('401 on DELETE /Users/:id when the parent Institution is soft-deleted', async () => {
    apiKeyFindUniqueMock.mockResolvedValue(
      authedKey(['admin:scim'], { institution: { deletedAt: new Date() } }),
    );
    const res = await request(buildApp())
      .delete('/scim/v2/Users/usr-1')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(res.status).toBe(401);
    expect(userMocks.update).not.toHaveBeenCalled();
  });

  it('still allows requests when Institution.deletedAt is null (live tenant)', async () => {
    apiKeyFindUniqueMock.mockResolvedValue(
      authedKey(['admin:scim'], { institution: { deletedAt: null } }),
    );
    userMocks.count.mockResolvedValue(0);
    userMocks.findMany.mockResolvedValue([]);
    const res = await request(buildApp())
      .get('/scim/v2/Users')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(res.status).toBe(200);
  });
});
