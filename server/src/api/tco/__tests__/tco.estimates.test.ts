import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret';

function makeToken(over: Partial<{
  userId: string;
  name: string;
  role: string;
  institutionId: string;
  tier: string;
}> = {}) {
  return jwt.sign(
    {
      userId: over.userId ?? 'u-1',
      email: 'u@test.com',
      name: over.name ?? 'Alice',
      // Phase 14.8 — TCO estimates are now role-gated to FINANCE /
      // PROCUREMENT_LEAD / INSTITUTION_ADMIN / SUPER_ADMIN. The
      // happy-path identity in this suite is a procurement lead;
      // tests that exercise the gate explicitly pass `role`.
      role: over.role ?? 'PROCUREMENT_LEAD',
      institutionId: over.institutionId ?? 'inst-1',
      institutionName: 'Test Uni',
      tier: over.tier ?? 'free',
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// Mock prisma AFTER setting up spies so the app picks up the mock.
vi.mock('../../../utils/prisma', () => {
  const tcoEstimate = {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  };
  const vendorSystem = { findMany: vi.fn().mockResolvedValue([]) };
  // Phase 16.7: saveEstimate now runs `enforceQuota` upstream and
  // `recordUsage` post-write, both of which touch `usageCounter`.
  // Tests in this file default the JWT tier to 'free' — the read
  // path must resolve a counter under-limit so the gate admits the
  // request even on the lowest tier.
  const usageCounter = {
    findUnique: vi.fn().mockResolvedValue({ count: 0 }),
    upsert: vi.fn().mockResolvedValue({ count: 1 }),
  };
  return {
    default: {
      tcoEstimate,
      vendorSystem,
      usageCounter,
      $queryRaw: vi.fn().mockResolvedValue([]),
      $disconnect: vi.fn(),
    },
  };
});

import { createApp } from '../../../app';
import prisma from '../../../utils/prisma';
const app = createApp();

const validSaveBody = {
  name: 'Workday 10k-student horizon',
  institutionSize: 'large',
  studentFte: 10000,
  staffFte: 1200,
};

describe('POST /api/tco/estimates — auth + attribution', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 AUTHENTICATION_ERROR for anonymous callers', async () => {
    const res = await request(app).post('/api/tco/estimates').send(validSaveBody);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      success: false,
      error: expect.objectContaining({ code: 'AUTHENTICATION_ERROR' }),
    });
    expect(prisma.tcoEstimate.create).not.toHaveBeenCalled();
  });

  it('stamps createdById from the JWT, ignoring any body override', async () => {
    vi.mocked(prisma.tcoEstimate.create).mockResolvedValueOnce({
      id: 'tco-1',
      ...validSaveBody,
      createdById: 'u-real', // whatever the DB row ends up with
    } as never);

    const token = makeToken({ userId: 'u-real', institutionId: 'inst-real' });
    const res = await request(app)
      .post('/api/tco/estimates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...validSaveBody,
        // Spoof attempt — these fields were dropped from the schema,
        // Zod strips them, and the controller stamps from req.user.
        createdById: 'attacker',
      });

    expect(res.status).toBe(201);
    expect(prisma.tcoEstimate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdById: 'u-real',
        institutionId: 'inst-real',
      }),
    });
  });

  it('ignores body-supplied institutionId (no cross-tenant writes)', async () => {
    // Regression: BugBot flagged that accepting an `institutionId`
    // override from the body let any authenticated user inject into
    // another tenant's namespace. The schema now strips it and the
    // controller stamps unconditionally from the JWT.
    vi.mocked(prisma.tcoEstimate.create).mockResolvedValueOnce({
      id: 'tco-2',
    } as never);

    const token = makeToken({ userId: 'u-attacker', institutionId: 'inst-home' });
    await request(app)
      .post('/api/tco/estimates')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validSaveBody, institutionId: 'inst-victim' });

    expect(prisma.tcoEstimate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdById: 'u-attacker',
        // Always the JWT institution — never the body's 'inst-victim'.
        institutionId: 'inst-home',
      }),
    });
  });

  it('400s on missing required fields (name / institutionSize / FTEs)', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/tco/estimates')
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionSize: 'large', studentFte: 1000 });

    expect(res.status).toBe(400);
    expect(prisma.tcoEstimate.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/tco/estimates — tenant scoping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 for anonymous callers', async () => {
    const res = await request(app).get('/api/tco/estimates');
    expect(res.status).toBe(401);
  });

  it('filters by the caller’s institutionId', async () => {
    vi.mocked(prisma.tcoEstimate.findMany).mockResolvedValueOnce([] as never);
    const token = makeToken({ institutionId: 'inst-home' });

    const res = await request(app)
      .get('/api/tco/estimates')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(prisma.tcoEstimate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { institutionId: 'inst-home' },
      }),
    );
  });
});

describe('GET /api/tco/estimates/:id — cross-tenant isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when the estimate belongs to a different tenant', async () => {
    // findFirst with the compound {id, institutionId} filter returns
    // null for both "truly missing" and "exists but different tenant".
    vi.mocked(prisma.tcoEstimate.findFirst).mockResolvedValueOnce(null);
    const token = makeToken({ institutionId: 'inst-home' });

    const res = await request(app)
      .get('/api/tco/estimates/tco-from-other-tenant')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(prisma.tcoEstimate.findFirst).toHaveBeenCalledWith({
      where: { id: 'tco-from-other-tenant', institutionId: 'inst-home' },
      include: expect.any(Object),
    });
  });

  it('returns the row when the estimate belongs to the caller’s tenant', async () => {
    vi.mocked(prisma.tcoEstimate.findFirst).mockResolvedValueOnce({
      id: 'tco-1',
      name: 'mine',
      institutionId: 'inst-home',
    } as never);
    const token = makeToken({ institutionId: 'inst-home' });

    const res = await request(app)
      .get('/api/tco/estimates/tco-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('tco-1');
  });
});

// Phase 14.8 — RBAC gate. TCO estimates carry commercially-sensitive
// pricing data; the brief restricts access to FINANCE / PROCUREMENT_LEAD
// and the two admin roles. Other authenticated roles get 403.
describe('TCO estimates — Phase 14.8 role gate', () => {
  beforeEach(() => vi.clearAllMocks());

  for (const role of ['VIEWER', 'EVALUATOR', 'STAKEHOLDER', 'AUDITOR'] as const) {
    it(`returns 403 AUTHORIZATION_ERROR for role=${role} on POST /estimates`, async () => {
      const token = makeToken({ role });
      const res = await request(app)
        .post('/api/tco/estimates')
        .set('Authorization', `Bearer ${token}`)
        .send(validSaveBody);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        success: false,
        error: expect.objectContaining({ code: 'AUTHORIZATION_ERROR' }),
      });
      expect(prisma.tcoEstimate.create).not.toHaveBeenCalled();
    });

    it(`returns 403 for role=${role} on GET /estimates`, async () => {
      const token = makeToken({ role });
      const res = await request(app)
        .get('/api/tco/estimates')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(prisma.tcoEstimate.findMany).not.toHaveBeenCalled();
    });
  }

  for (const role of ['FINANCE', 'PROCUREMENT_LEAD', 'INSTITUTION_ADMIN', 'SUPER_ADMIN'] as const) {
    it(`grants access to role=${role} on GET /estimates`, async () => {
      vi.mocked(prisma.tcoEstimate.findMany).mockResolvedValueOnce([] as never);
      const token = makeToken({ role });
      const res = await request(app)
        .get('/api/tco/estimates')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(prisma.tcoEstimate.findMany).toHaveBeenCalled();
    });
  }
});
