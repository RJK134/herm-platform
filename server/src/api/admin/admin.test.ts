import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app';
const app = createApp();

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret';

function makeAdminToken(role = 'SUPER_ADMIN') {
  return jwt.sign(
    {
      userId: 'admin1',
      email: 'admin@test.com',
      name: 'Admin',
      role,
      institutionId: 'inst1',
      institutionName: 'Test University',
      tier: 'pro',
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

vi.mock('../../utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn(),
    vendorAccount: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'va1', companyName: 'Acme Systems', status: 'pending', tier: 'BASIC', system: null, _count: { submissions: 0, users: 1 }, createdAt: new Date(), updatedAt: new Date() },
      ]),
      count: vi.fn().mockResolvedValue(1),
      update: vi.fn(),
    },
    vendorSubmission: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(),
    },
  },
}));

describe('GET /api/admin/vendors', () => {
  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/admin/vendors');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 403 for non-admin role', async () => {
    const token = makeAdminToken('student');
    const res = await request(app)
      .get('/api/admin/vendors')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 200 with vendor list for SUPER_ADMIN', async () => {
    const token = makeAdminToken('SUPER_ADMIN');
    const res = await request(app)
      .get('/api/admin/vendors')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.total).toBe(1);
  });

  it('returns 200 for INSTITUTION_ADMIN role', async () => {
    const token = makeAdminToken('INSTITUTION_ADMIN');
    const res = await request(app)
      .get('/api/admin/vendors')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('rejects invalid limit param with 400', async () => {
    const token = makeAdminToken();
    const res = await request(app)
      .get('/api/admin/vendors?limit=999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/admin/submissions', () => {
  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/admin/submissions');
    expect(res.status).toBe(401);
  });

  it('returns 200 with submission list for SUPER_ADMIN', async () => {
    const token = makeAdminToken();
    const res = await request(app)
      .get('/api/admin/submissions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
  });

  it('accepts valid status filter', async () => {
    const token = makeAdminToken();
    const res = await request(app)
      .get('/api/admin/submissions?status=pending')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('rejects invalid status value with 400', async () => {
    const token = makeAdminToken();
    const res = await request(app)
      .get('/api/admin/submissions?status=garbage')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
