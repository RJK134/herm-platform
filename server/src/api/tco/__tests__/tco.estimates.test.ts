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
      role: over.role ?? 'VIEWER',
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
  return {
    default: {
      tcoEstimate,
      vendorSystem,
      $queryRaw: vi.fn().mockResolvedValue([]),
      $disconnect: vi.fn(),
    },
  };
});

import app from '../../../app';
import prisma from '../../../utils/prisma';

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

  it('honours a body-supplied institutionId (cross-tenant save for admins)', async () => {
    vi.mocked(prisma.tcoEstimate.create).mockResolvedValueOnce({
      id: 'tco-2',
    } as never);

    const token = makeToken({ userId: 'u-admin', institutionId: 'inst-home' });
    await request(app)
      .post('/api/tco/estimates')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validSaveBody, institutionId: 'inst-other' });

    expect(prisma.tcoEstimate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdById: 'u-admin',
        institutionId: 'inst-other',
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
