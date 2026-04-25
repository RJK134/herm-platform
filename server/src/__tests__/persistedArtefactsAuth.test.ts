/**
 * Persisted-artefact mutation surfaces (architecture / value / documents)
 * are listed under "Authenticated (any tier)" in HERM_COMPLIANCE.md.
 *
 * Pre-fix, these routers used `optionalJWT` only — anonymous POSTs to
 * `/api/architecture`, `/api/value`, `/api/documents` were silently
 * accepted by the controllers (which only set `institutionId` if
 * `req.user` was present, falling through to a row with no tenant).
 *
 * These tests pin the route-level enforcement: stateless previews
 * (`/analyse`, `/calculate`, `/generate`) stay public, persisted
 * write/read endpoints require a JWT.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import { errorHandler } from '../middleware/errorHandler';
import { requestId } from '../middleware/requestId';

vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { architectureSvcMock, valueSvcMock, documentsSvcMock } = vi.hoisted(() => ({
  architectureSvcMock: { analyse: vi.fn(() => ({ ok: true })) },
  valueSvcMock: { calculate: vi.fn(async () => ({ ok: true })), getBenchmarks: vi.fn(() => []) },
  documentsSvcMock: { generate: vi.fn(async () => ({ ok: true })) },
}));

vi.mock('../api/architecture/architecture.service', () => ({
  ArchitectureService: function () {
    return architectureSvcMock;
  },
}));
vi.mock('../api/value/value.service', () => ({
  ValueService: function () {
    return valueSvcMock;
  },
}));
vi.mock('../api/documents/documents.service', () => ({
  DocumentsService: function () {
    return documentsSvcMock;
  },
}));

import architectureRouter from '../api/architecture/architecture.router';
import valueRouter from '../api/value/value.router';
import documentsRouter from '../api/documents/documents.router';

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/architecture', architectureRouter);
  app.use('/api/value', valueRouter);
  app.use('/api/documents', documentsRouter);
  app.use(errorHandler);
  return app;
}

describe('persisted-artefact route auth', () => {
  describe('/api/architecture', () => {
    it('POST /analyse is public (stateless preview)', async () => {
      const res = await request(buildApp())
        .post('/api/architecture/analyse')
        .send({ name: 'x', currentSystems: [], futureCapabilities: [] });
      // 200 (success) or 400 (zod) — what we're asserting is NOT 401.
      expect(res.status).not.toBe(401);
    });

    it('POST / requires JWT (persisted assessment)', async () => {
      const res = await request(buildApp()).post('/api/architecture').send({});
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('GET / requires JWT', async () => {
      const res = await request(buildApp()).get('/api/architecture');
      expect(res.status).toBe(401);
    });

    it('DELETE /:id requires JWT', async () => {
      const res = await request(buildApp()).delete('/api/architecture/abc');
      expect(res.status).toBe(401);
    });
  });

  describe('/api/value', () => {
    it('GET /benchmarks is public', async () => {
      const res = await request(buildApp()).get('/api/value/benchmarks');
      expect(res.status).toBe(200);
    });

    it('POST /calculate is public (stateless)', async () => {
      const res = await request(buildApp()).post('/api/value/calculate').send({});
      // not 401 — schema may 400, that's fine.
      expect(res.status).not.toBe(401);
    });

    it('POST / requires JWT (persisted analysis)', async () => {
      const res = await request(buildApp()).post('/api/value').send({});
      expect(res.status).toBe(401);
    });

    it('GET / requires JWT', async () => {
      const res = await request(buildApp()).get('/api/value');
      expect(res.status).toBe(401);
    });
  });

  describe('/api/documents', () => {
    it('POST /generate is public (stateless preview)', async () => {
      const res = await request(buildApp()).post('/api/documents/generate').send({});
      expect(res.status).not.toBe(401);
    });

    it('POST / requires JWT (persisted save)', async () => {
      const res = await request(buildApp()).post('/api/documents').send({});
      expect(res.status).toBe(401);
    });

    it('PATCH /:id requires JWT', async () => {
      const res = await request(buildApp()).patch('/api/documents/abc').send({});
      expect(res.status).toBe(401);
    });

    it('DELETE /:id requires JWT', async () => {
      const res = await request(buildApp()).delete('/api/documents/abc');
      expect(res.status).toBe(401);
    });
  });
});
