import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validateBody } from '../validate';
import { errorHandler } from '../errorHandler';

// The shared prisma singleton is imported transitively via app.ts in other
// tests; here we build a minimal app so validation can be exercised in
// isolation.
vi.mock('../../utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

function makeApp(schema: z.ZodSchema) {
  const app = express();
  app.use(express.json());
  app.post('/thing', validateBody(schema), (req, res) => {
    res.json({ ok: true, body: req.body });
  });
  app.use(errorHandler);
  return app;
}

describe('validateBody middleware', () => {
  const schema = z.object({ name: z.string().min(3), age: z.number().int().positive() });

  it('passes through valid bodies', async () => {
    const app = makeApp(schema);
    const res = await request(app).post('/thing').send({ name: 'alice', age: 30 });
    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({ name: 'alice', age: 30 });
  });

  it('rejects invalid bodies with 400 and details', async () => {
    const app = makeApp(schema);
    const res = await request(app).post('/thing').send({ name: 'a', age: -1 });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(res.body.error.details).toHaveLength(2);
    expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual([
      'age',
      'name',
    ]);
  });

  it('rejects missing required fields', async () => {
    const app = makeApp(schema);
    const res = await request(app).post('/thing').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
