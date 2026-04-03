import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../app';
import bcrypt from 'bcryptjs';

const HASH = bcrypt.hashSync('password123', 1); // fast hash for tests

const MOCK_USER = {
  id: 'user1',
  email: 'admin@demo.ac.uk',
  name: 'Demo Admin',
  passwordHash: HASH,
  role: 'INSTITUTION_ADMIN',
  institutionId: 'inst1',
  institution: { name: 'Demo University', tier: 'professional' },
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
      findUnique: vi.fn().mockResolvedValue({ id: 'inst1', name: 'Demo University', tier: 'professional' }),
      create: vi.fn().mockResolvedValue({ id: 'inst1', name: 'Demo University', tier: 'professional' }),
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
