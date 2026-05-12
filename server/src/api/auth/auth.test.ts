import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app';
import bcrypt from 'bcryptjs';
const app = createApp();

const HASH = bcrypt.hashSync('password123', 1); // fast hash for tests

const MOCK_USER = {
  id: 'user1',
  email: 'admin@demo.ac.uk',
  name: 'Demo Admin',
  passwordHash: HASH,
  role: 'INSTITUTION_ADMIN',
  institutionId: 'inst1',
  institution: { name: 'Demo University', tier: 'pro' },
  createdAt: new Date(),
  updatedAt: new Date(),
};

vi.mock('../../utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn(),
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    institution: {
      findUnique: vi.fn().mockResolvedValue({ id: 'inst1', name: 'Demo University', tier: 'pro' }),
      create: vi.fn().mockResolvedValue({ id: 'inst1', name: 'Demo University', tier: 'pro' }),
    },
    subscription: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

describe('POST /api/auth/login', () => {
  it('returns 200 with token for valid credentials', async () => {
    const prisma = (await import('../../utils/prisma')).default;
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER as never);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@demo.ac.uk', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(typeof res.body.data.token).toBe('string');
  });

  it('returns 401 for wrong password', async () => {
    const prisma = (await import('../../utils/prisma')).default;
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER as never);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@demo.ac.uk', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for unknown email', async () => {
    const prisma = (await import('../../utils/prisma')).default;
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unknown@nobody.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for missing email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/auth/login — tier claim on JWT', () => {
  const USER_WITH_SUB = {
    ...MOCK_USER,
    institution: {
      ...MOCK_USER.institution,
      subscription: { tier: 'PRO', status: 'active' },
    },
  };

  afterEach(() => {
    delete process.env['DEV_UNLOCK_ALL_TIERS'];
  });

  it('without DEV_UNLOCK_ALL_TIERS, tier claim reflects the subscription tier', async () => {
    const prisma = (await import('../../utils/prisma')).default;
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(USER_WITH_SUB as never);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@demo.ac.uk', password: 'password123' });

    expect(res.status).toBe(200);
    const decoded = jwt.decode(res.body.data.token) as { tier?: string } | null;
    expect(decoded?.tier).toBe('pro');
  });

  it('with DEV_UNLOCK_ALL_TIERS=true, tier claim is forced to "enterprise"', async () => {
    process.env['DEV_UNLOCK_ALL_TIERS'] = 'true';
    const prisma = (await import('../../utils/prisma')).default;
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(USER_WITH_SUB as never);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@demo.ac.uk', password: 'password123' });

    expect(res.status).toBe(200);
    const decoded = jwt.decode(res.body.data.token) as { tier?: string } | null;
    expect(decoded?.tier).toBe('enterprise');
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 401 with malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.valid.token');
    expect(res.status).toBe(401);
  });
});
