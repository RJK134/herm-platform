import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../app';

// Hoisted alongside vi.mock so the factory below can reference it.
// frameworkContext middleware (mounted on /api/systems, /api/capabilities,
// /api/scores, /api/vendor-portal) needs a Framework to resolve during tests.
const { mockFramework } = vi.hoisted(() => ({
  mockFramework: {
    id: 'fw-herm',
    slug: 'herm-v3.1',
    name: 'UCISA HERM v3.1',
    version: '3.1',
    publisher: 'CAUDIT',
    description: 'HE Reference Model',
    licenceType: 'CC-BY-NC-SA-4.0',
    licenceNotice: null,
    licenceUrl: null,
    isPublic: true,
    isDefault: false,
    isActive: true,
    domainCount: 10,
    capabilityCount: 165,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
}));

vi.mock('../../utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn(),
    framework: {
      findFirst: vi.fn().mockResolvedValue(mockFramework),
      findUnique: vi.fn().mockResolvedValue(mockFramework),
    },
    vendorSystem: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'sys1', name: 'Ellucian Banner', vendor: 'Ellucian', category: 'SIS', cloudNative: false },
        { id: 'sys2', name: 'Workday Student', vendor: 'Workday', category: 'SIS', cloudNative: true },
        { id: 'sys3', name: 'Moodle LMS', vendor: 'Moodle HQ', category: 'LMS', cloudNative: false },
      ]),
      findUnique: vi.fn().mockResolvedValue({ id: 'sys1', name: 'Ellucian Banner', vendor: 'Ellucian', category: 'SIS' }),
    },
    capabilityScore: { findMany: vi.fn().mockResolvedValue([]) },
    frameworkDomain: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

describe('GET /api/systems', () => {
  it('returns 200 with array of systems', async () => {
    const res = await request(app).get('/api/systems');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(3);
  });

  it('accepts valid category filter', async () => {
    const prisma = (await import('../../utils/prisma')).default;
    vi.mocked(prisma.vendorSystem.findMany).mockResolvedValueOnce([
      { id: 'sys1', name: 'Ellucian Banner', vendor: 'Ellucian', category: 'SIS', cloudNative: false } as never,
      { id: 'sys2', name: 'Workday Student', vendor: 'Workday', category: 'SIS', cloudNative: true } as never,
    ]);
    const res = await request(app).get('/api/systems?category=SIS');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects category longer than 100 chars with 400', async () => {
    const longCategory = 'x'.repeat(101);
    const res = await request(app).get(`/api/systems?category=${longCategory}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts valid limit and offset params', async () => {
    const res = await request(app).get('/api/systems?limit=10&offset=0');
    expect(res.status).toBe(200);
  });

  it('rejects limit above 200 with 400', async () => {
    const res = await request(app).get('/api/systems?limit=999');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/systems/compare', () => {
  it('returns 400 when fewer than 2 IDs provided', async () => {
    const res = await request(app).get('/api/systems/compare?ids=sys1');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects IDs with invalid characters', async () => {
    const res = await request(app).get('/api/systems/compare?ids=sys1,<script>');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
