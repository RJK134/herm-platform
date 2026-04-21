import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret';

function makeToken(tier: string) {
  return jwt.sign(
    {
      userId: 'user1',
      email: 'user@test.com',
      name: 'Test User',
      role: 'user',
      institutionId: 'inst1',
      institutionName: 'Test University',
      tier,
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

const publicFramework = {
  id: 'fw-pub',
  slug: 'herm-v3',
  name: 'UCISA HERM v3.1',
  version: '3.1',
  publisher: 'CAUDIT',
  description: 'HE Reference Model',
  licenceType: 'CC-BY-NC-SA-4.0',
  licenceNotice: 'Attribution required',
  licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  isPublic: true,
  isDefault: true,
  isActive: true,
  domainCount: 10,
  capabilityCount: 165,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const privateFramework = {
  id: 'fw-priv',
  slug: 'fhe-framework',
  name: 'FHE Capability Framework',
  version: '1.0',
  publisher: 'FHE',
  description: 'Proprietary framework',
  licenceType: 'PROPRIETARY',
  licenceNotice: null,
  licenceUrl: null,
  isPublic: false,
  isDefault: false,
  isActive: true,
  domainCount: 5,
  capabilityCount: 80,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockDomains = [
  {
    id: 'dom1',
    code: 'LT',
    name: 'Learning & Teaching',
    category: 'Academic',
    description: 'Learning and teaching capabilities',
    sortOrder: 1,
    colour: '#3B82F6',
    capabilityCount: 20,
  },
  {
    id: 'dom2',
    code: 'RE',
    name: 'Research & Innovation',
    category: 'Academic',
    description: 'Research capabilities',
    sortOrder: 2,
    colour: '#10B981',
    capabilityCount: 15,
  },
];

vi.mock('../../utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn(),
    framework: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

describe('GET /api/frameworks', () => {
  let prisma: typeof import('../../utils/prisma').default;

  beforeEach(async () => {
    prisma = (await import('../../utils/prisma')).default;
    vi.mocked(prisma.framework.findMany).mockReset();
    vi.mocked(prisma.framework.findUnique).mockReset();
  });

  it('returns only public frameworks for anonymous users', async () => {
    vi.mocked(prisma.framework.findMany).mockResolvedValueOnce([publicFramework] as never);

    const res = await request(app).get('/api/frameworks');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('UCISA HERM v3.1');
    expect(res.body.data[0].isPublic).toBe(true);

    // Verify the Prisma call included isPublic filter for anonymous users
    expect(prisma.framework.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          isPublic: true,
        }),
      }),
    );
  });

  it('returns all active frameworks for authenticated paid-tier users', async () => {
    vi.mocked(prisma.framework.findMany).mockResolvedValueOnce(
      [publicFramework, privateFramework] as never,
    );

    const token = makeToken('professional');
    const res = await request(app)
      .get('/api/frameworks')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);

    // Verify the Prisma call did NOT include isPublic filter for paid users
    expect(prisma.framework.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
        }),
      }),
    );
    const callArgs = vi.mocked(prisma.framework.findMany).mock.calls[0][0] as Record<string, unknown>;
    expect((callArgs.where as Record<string, unknown>).isPublic).toBeUndefined();
  });

  it('returns licence metadata for CC-licensed frameworks', async () => {
    vi.mocked(prisma.framework.findMany).mockResolvedValueOnce([publicFramework] as never);

    const res = await request(app).get('/api/frameworks');

    expect(res.status).toBe(200);
    expect(res.body.data[0].licenceType).toBe('CC-BY-NC-SA-4.0');
    expect(res.body.data[0].publisher).toBe('CAUDIT');
  });
});

describe('GET /api/frameworks/:id', () => {
  let prisma: typeof import('../../utils/prisma').default;

  beforeEach(async () => {
    prisma = (await import('../../utils/prisma')).default;
    vi.mocked(prisma.framework.findMany).mockReset();
    vi.mocked(prisma.framework.findUnique).mockReset();
  });

  it('returns framework with domain counts', async () => {
    vi.mocked(prisma.framework.findUnique).mockResolvedValueOnce({
      ...publicFramework,
      domains: mockDomains,
    } as never);

    const res = await request(app).get('/api/frameworks/fw-pub');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('fw-pub');
    expect(res.body.data.name).toBe('UCISA HERM v3.1');
    expect(res.body.data.domainCount).toBe(10);
    expect(Array.isArray(res.body.data.domains)).toBe(true);
    expect(res.body.data.domains).toHaveLength(2);
    expect(res.body.data.domains[0].code).toBe('LT');
    expect(res.body.data.domains[0].capabilityCount).toBe(20);
  });

  it('returns 404 for non-existent framework', async () => {
    vi.mocked(prisma.framework.findUnique).mockResolvedValueOnce(null);

    const res = await request(app).get('/api/frameworks/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('does-not-exist');
  });

  it('returns 404 for inactive framework', async () => {
    vi.mocked(prisma.framework.findUnique).mockResolvedValueOnce({
      ...publicFramework,
      isActive: false,
      domains: [],
    } as never);

    const res = await request(app).get('/api/frameworks/fw-pub');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 403 for non-public framework accessed by anonymous user', async () => {
    vi.mocked(prisma.framework.findUnique).mockResolvedValueOnce({
      ...privateFramework,
      domains: [],
    } as never);

    const res = await request(app).get('/api/frameworks/fw-priv');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
    expect(res.body.error.message).toContain('Upgrade');
  });

  it('returns non-public framework for paid-tier user', async () => {
    vi.mocked(prisma.framework.findUnique).mockResolvedValueOnce({
      ...privateFramework,
      domains: mockDomains,
    } as never);

    const token = makeToken('enterprise');
    const res = await request(app)
      .get('/api/frameworks/fw-priv')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('fw-priv');
    expect(res.body.data.isPublic).toBe(false);
  });

  it('includes licence metadata for CC-licensed framework', async () => {
    vi.mocked(prisma.framework.findUnique).mockResolvedValueOnce({
      ...publicFramework,
      domains: [],
    } as never);

    const res = await request(app).get('/api/frameworks/fw-pub');

    expect(res.status).toBe(200);
    expect(res.body.data.licenceType).toBe('CC-BY-NC-SA-4.0');
    expect(res.body.data.publisher).toBe('CAUDIT');
    expect(res.body.data.licenceUrl).toBe('https://creativecommons.org/licenses/by-nc-sa/4.0/');
    expect(res.body.data.licenceNotice).toBe('Attribution required');
  });
});
