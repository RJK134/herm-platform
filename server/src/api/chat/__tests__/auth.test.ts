import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

vi.mock('../../../utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

let app: Express;

beforeAll(async () => {
  const mod = await import('../../../app');
  app = mod.createApp();
});

// Chat hits the LLM and costs money per request. Every endpoint must require
// a valid JWT — this test locks in that contract so a future refactor can't
// silently open the route to the public internet.
describe('chat router is protected by authenticateJWT', () => {
  it('POST /api/chat without a token → 401', async () => {
    const res = await request(app).post('/api/chat').send({ sessionId: 'x', message: 'hello' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('GET /api/chat/sessions/:id without a token → 401', async () => {
    const res = await request(app).get('/api/chat/sessions/abc');
    expect(res.status).toBe(401);
  });

  it('DELETE /api/chat/sessions/:id without a token → 401', async () => {
    const res = await request(app).delete('/api/chat/sessions/abc');
    expect(res.status).toBe(401);
  });

  it('POST /api/chat with an invalid token → 401', async () => {
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', 'Bearer not.a.jwt')
      .send({ sessionId: 'x', message: 'hello' });
    expect(res.status).toBe(401);
  });
});
