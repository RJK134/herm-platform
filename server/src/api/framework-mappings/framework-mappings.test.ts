import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret';

function makeToken(tier: string, role = 'VIEWER') {
  return jwt.sign(
    {
      userId: 'user1',
      email: 'user@test.com',
      name: 'Test User',
      role,
      institutionId: 'inst1',
      institutionName: 'Test University',
      tier,
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// Minimal fixtures for the mocked Prisma layer.
const hermFramework = {
  id: 'fw-herm',
  slug: 'herm-v3.1',
  name: 'UCISA HERM v3.1',
  version: '3.1',
};

const fheFramework = {
  id: 'fw-fhe',
  slug: 'fhe-capability-framework',
  name: 'FHE Capability Framework',
  version: '1.0',
};

const mapping = {
  id: 'map-1',
  sourceFrameworkId: hermFramework.id,
  targetFrameworkId: fheFramework.id,
  name: 'HERM v3.1 → FHE v1.0',
  description: 'Test mapping',
  mappingType: 'official',
  createdBy: 'system',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mappingWithFrameworks = {
  ...mapping,
  sourceFramework: hermFramework,
  targetFramework: fheFramework,
  _count: { items: 3 },
};

const sourceCapability = {
  id: 'cap-bc008',
  code: 'BC008',
  name: 'Student Recruitment',
  description: 'HERM student recruitment capability',
  frameworkId: hermFramework.id,
  sortOrder: 8,
  domain: { code: 'LT', name: 'Learning & Teaching' },
};

const targetCapability = {
  id: 'cap-fhe-sl-001',
  code: 'FHE-SL-001',
  name: 'Prospect Pipeline Orchestration',
  description: 'FHE prospect pipeline capability',
  frameworkId: fheFramework.id,
  sortOrder: 1,
  domain: { code: 'SL', name: 'Student Lifecycle Operations', id: 'dom-sl' },
};

const mappingWithItems = {
  ...mapping,
  sourceFramework: hermFramework,
  targetFramework: fheFramework,
  items: [
    {
      id: 'ci-1',
      mappingId: mapping.id,
      sourceCapabilityId: sourceCapability.id,
      targetCapabilityId: targetCapability.id,
      strength: 'strong',
      confidence: 85,
      notes: 'Recruitment maps to prospect pipeline management',
      sourceCapability: {
        id: sourceCapability.id,
        code: sourceCapability.code,
        name: sourceCapability.name,
        description: sourceCapability.description,
        domain: sourceCapability.domain,
      },
      targetCapability: {
        id: targetCapability.id,
        code: targetCapability.code,
        name: targetCapability.name,
        description: targetCapability.description,
        domain: { code: targetCapability.domain.code, name: targetCapability.domain.name },
      },
    },
  ],
};

vi.mock('../../utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn(),
    frameworkMapping: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    capability: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    capabilityMapping: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

describe('GET /api/framework-mappings (Enterprise gate)', () => {
  let prisma: typeof import('../../utils/prisma').default;

  beforeEach(async () => {
    prisma = (await import('../../utils/prisma')).default;
    vi.mocked(prisma.frameworkMapping.findMany).mockReset();
    vi.mocked(prisma.frameworkMapping.findUnique).mockReset();
    vi.mocked(prisma.capability.findFirst).mockReset();
    vi.mocked(prisma.capabilityMapping.findMany).mockReset();
  });

  it('returns 403 for anonymous users', async () => {
    const res = await request(app).get('/api/framework-mappings');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 403 for free-tier users', async () => {
    const token = makeToken('free');
    const res = await request(app)
      .get('/api/framework-mappings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
    expect(res.body.error.message).toContain('Enterprise');
  });

  it('returns 403 for professional-tier users', async () => {
    const token = makeToken('professional');
    const res = await request(app)
      .get('/api/framework-mappings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 200 with data for enterprise-tier users', async () => {
    vi.mocked(prisma.frameworkMapping.findMany).mockResolvedValueOnce([mappingWithFrameworks] as never);

    const token = makeToken('enterprise');
    const res = await request(app)
      .get('/api/framework-mappings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('HERM v3.1 → FHE v1.0');
    expect(res.body.data[0].sourceFramework.slug).toBe('herm-v3.1');
    expect(res.body.data[0].targetFramework.slug).toBe('fhe-capability-framework');
    expect(res.body.data[0]._count.items).toBe(3);
  });

  it('returns 200 for SUPER_ADMIN users regardless of tier', async () => {
    vi.mocked(prisma.frameworkMapping.findMany).mockResolvedValueOnce([mappingWithFrameworks] as never);

    const token = makeToken('free', 'SUPER_ADMIN');
    const res = await request(app)
      .get('/api/framework-mappings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/framework-mappings/:id', () => {
  let prisma: typeof import('../../utils/prisma').default;

  beforeEach(async () => {
    prisma = (await import('../../utils/prisma')).default;
    vi.mocked(prisma.frameworkMapping.findMany).mockReset();
    vi.mocked(prisma.frameworkMapping.findUnique).mockReset();
    vi.mocked(prisma.capability.findFirst).mockReset();
    vi.mocked(prisma.capabilityMapping.findMany).mockReset();
  });

  it('returns mapping with items for enterprise users', async () => {
    vi.mocked(prisma.frameworkMapping.findUnique).mockResolvedValueOnce(mappingWithItems as never);

    const token = makeToken('enterprise');
    const res = await request(app)
      .get('/api/framework-mappings/map-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('map-1');
    expect(res.body.data.name).toBe('HERM v3.1 → FHE v1.0');
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].sourceCapability.code).toBe('BC008');
    expect(res.body.data.items[0].targetCapability.code).toBe('FHE-SL-001');
    expect(res.body.data.items[0].strength).toBe('strong');
    expect(res.body.data.items[0].confidence).toBe(85);
  });

  it('returns 404 when the mapping does not exist', async () => {
    vi.mocked(prisma.frameworkMapping.findUnique).mockResolvedValueOnce(null);

    const token = makeToken('enterprise');
    const res = await request(app)
      .get('/api/framework-mappings/does-not-exist')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 403 for anonymous users', async () => {
    const res = await request(app).get('/api/framework-mappings/map-1');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
  });
});

describe('GET /api/framework-mappings/:id/lookup', () => {
  let prisma: typeof import('../../utils/prisma').default;

  beforeEach(async () => {
    prisma = (await import('../../utils/prisma')).default;
    vi.mocked(prisma.frameworkMapping.findMany).mockReset();
    vi.mocked(prisma.frameworkMapping.findUnique).mockReset();
    vi.mocked(prisma.capability.findFirst).mockReset();
    vi.mocked(prisma.capabilityMapping.findMany).mockReset();
  });

  it('returns target capabilities for a valid sourceCode', async () => {
    vi.mocked(prisma.frameworkMapping.findUnique).mockResolvedValueOnce(mapping as never);
    vi.mocked(prisma.capability.findFirst).mockResolvedValueOnce(sourceCapability as never);
    vi.mocked(prisma.capabilityMapping.findMany).mockResolvedValueOnce([
      {
        id: 'ci-1',
        mappingId: mapping.id,
        sourceCapabilityId: sourceCapability.id,
        targetCapabilityId: targetCapability.id,
        strength: 'strong',
        confidence: 85,
        notes: 'Recruitment maps to prospect pipeline management',
        targetCapability: {
          ...targetCapability,
          domain: { id: 'dom-sl', code: 'SL', name: 'Student Lifecycle Operations' },
        },
      },
    ] as never);

    const token = makeToken('enterprise');
    const res = await request(app)
      .get('/api/framework-mappings/map-1/lookup?sourceCode=BC008')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sourceCapability.code).toBe('BC008');
    expect(Array.isArray(res.body.data.targets)).toBe(true);
    expect(res.body.data.targets).toHaveLength(1);
    expect(res.body.data.targets[0].capability.code).toBe('FHE-SL-001');
    expect(res.body.data.targets[0].capability.domain).toBe('Student Lifecycle Operations');
    expect(res.body.data.targets[0].strength).toBe('strong');
    expect(res.body.data.targets[0].confidence).toBe(85);
    expect(res.body.data.targets[0].notes).toContain('prospect pipeline');
  });

  it('returns sourceCapability=null and empty targets when source code not found', async () => {
    vi.mocked(prisma.frameworkMapping.findUnique).mockResolvedValueOnce(mapping as never);
    vi.mocked(prisma.capability.findFirst).mockResolvedValueOnce(null);

    const token = makeToken('enterprise');
    const res = await request(app)
      .get('/api/framework-mappings/map-1/lookup?sourceCode=BC999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sourceCapability).toBeNull();
    expect(res.body.data.targets).toEqual([]);
  });

  it('returns 400 when sourceCode query param is missing', async () => {
    const token = makeToken('enterprise');
    const res = await request(app)
      .get('/api/framework-mappings/map-1/lookup')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('sourceCode');
  });

  it('returns 404 when the mapping does not exist', async () => {
    vi.mocked(prisma.frameworkMapping.findUnique).mockResolvedValueOnce(null);

    const token = makeToken('enterprise');
    const res = await request(app)
      .get('/api/framework-mappings/nope/lookup?sourceCode=BC008')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 403 for non-enterprise users', async () => {
    const token = makeToken('professional');
    const res = await request(app)
      .get('/api/framework-mappings/map-1/lookup?sourceCode=BC008')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
  });
});
