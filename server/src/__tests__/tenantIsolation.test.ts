/**
 * Tenant isolation invariants for the persisted-artefact surface.
 *
 * Pre-fix, every list/get/update/delete on documents, architecture,
 * value, and integration ran an unscoped Prisma query. An authenticated
 * tenant A could read or mutate tenant B's rows by id-guessing.
 *
 * After the fix, every read/write filters on `{ id, institutionId }` so
 * wrong-owner ids surface as 404 (we deliberately do not return 403 — we
 * never confirm row existence to other tenants). These tests pin that
 * contract end-to-end through the real router + middleware stack.
 *
 * Source of truth: HERM_COMPLIANCE.md "Authenticated (any tier)".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { errorHandler } from '../middleware/errorHandler';
import { requestId } from '../middleware/requestId';

vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    generatedDocument: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    architectureAssessment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    valueAnalysis: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    integrationAssessment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));
vi.mock('../utils/prisma', () => ({ default: prismaMock }));

import documentsRouter from '../api/documents/documents.router';
import architectureRouter from '../api/architecture/architecture.router';
import valueRouter from '../api/value/value.router';
import integrationRouter from '../api/integration/integration.router';

const SECRET = process.env['JWT_SECRET'] ?? 'test-jwt-secret-do-not-use-in-prod';

function tokenFor(institutionId: string, userId = `user-${institutionId}`): string {
  return jwt.sign(
    {
      userId,
      email: `${userId}@${institutionId}.test`,
      name: userId,
      role: 'VIEWER',
      institutionId,
      institutionName: `Inst ${institutionId}`,
      tier: 'free',
    },
    SECRET,
  );
}

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/documents', documentsRouter);
  app.use('/api/architecture', architectureRouter);
  app.use('/api/value', valueRouter);
  app.use('/api/integration', integrationRouter);
  app.use(errorHandler);
  return app;
}

describe('tenant isolation: persisted artefact reads/writes', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Documents ────────────────────────────────────────────────────────────

  describe('/api/documents', () => {
    it('list scopes findMany by req.user.institutionId', async () => {
      prismaMock.generatedDocument.findMany.mockResolvedValueOnce([{ id: 'd-A', title: 'A doc' }]);
      const res = await request(buildApp())
        .get('/api/documents')
        .set('Authorization', `Bearer ${tokenFor('inst-A')}`);
      expect(res.status).toBe(200);
      expect(prismaMock.generatedDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { institutionId: 'inst-A' } }),
      );
    });

    it('tenant A cannot get tenant B\'s document by id (returns 404)', async () => {
      // Caller is tenant A; prisma findFirst returns null because the row
      // belongs to inst-B (the where-clause includes institutionId='inst-A').
      prismaMock.generatedDocument.findFirst.mockResolvedValueOnce(null);
      const res = await request(buildApp())
        .get('/api/documents/doc-belongs-to-B')
        .set('Authorization', `Bearer ${tokenFor('inst-A')}`);
      expect(res.status).toBe(404);
      expect(prismaMock.generatedDocument.findFirst).toHaveBeenCalledWith({
        where: { id: 'doc-belongs-to-B', institutionId: 'inst-A' },
      });
    });

    it('tenant A can get its own document', async () => {
      prismaMock.generatedDocument.findFirst.mockResolvedValueOnce({ id: 'doc-A1', institutionId: 'inst-A' });
      const res = await request(buildApp())
        .get('/api/documents/doc-A1')
        .set('Authorization', `Bearer ${tokenFor('inst-A')}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('doc-A1');
    });

    it('PATCH against another tenant\'s id returns 404 (atomic where-scope, no update)', async () => {
      // updateMany is the atomic tenant-scoped gate: { id, institutionId }
      // returns count=0 when the row exists but belongs to a different
      // tenant — same response as not-found. Closes the TOCTOU window
      // that a findFirst-then-update sequence would leave open.
      prismaMock.generatedDocument.updateMany.mockResolvedValueOnce({ count: 0 });
      const res = await request(buildApp())
        .patch('/api/documents/doc-belongs-to-B')
        .set('Authorization', `Bearer ${tokenFor('inst-A')}`)
        .send({ title: 'sneaky rename' });
      expect(res.status).toBe(404);
      expect(prismaMock.generatedDocument.updateMany).toHaveBeenCalledWith({
        where: { id: 'doc-belongs-to-B', institutionId: 'inst-A' },
        data: expect.objectContaining({ title: 'sneaky rename' }),
      });
      // The ordinary update() must never be called for cross-tenant PATCHes.
      expect(prismaMock.generatedDocument.update).not.toHaveBeenCalled();
      // And we must not re-read the row (which would expose existence).
      // The re-read uses findFirst with institutionId scoping; if updateMany
      // returns 0 we throw before reaching it, so neither read should fire.
      expect(prismaMock.generatedDocument.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.generatedDocument.findUnique).not.toHaveBeenCalled();
    });

    it('PATCH against own id updates atomically and re-reads with institutionId scope', async () => {
      prismaMock.generatedDocument.updateMany.mockResolvedValueOnce({ count: 1 });
      // Defense-in-depth: the re-read after updateMany also filters by
      // institutionId — every Prisma read on a tenant-owned model must
      // carry the institutionId filter.
      prismaMock.generatedDocument.findFirst.mockResolvedValueOnce({
        id: 'doc-A1',
        institutionId: 'inst-A',
        title: 'renamed',
      });
      const res = await request(buildApp())
        .patch('/api/documents/doc-A1')
        .set('Authorization', `Bearer ${tokenFor('inst-A')}`)
        .send({ title: 'renamed' });
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('renamed');
      expect(prismaMock.generatedDocument.updateMany).toHaveBeenCalledWith({
        where: { id: 'doc-A1', institutionId: 'inst-A' },
        data: expect.objectContaining({ title: 'renamed' }),
      });
      expect(prismaMock.generatedDocument.findFirst).toHaveBeenCalledWith({
        where: { id: 'doc-A1', institutionId: 'inst-A' },
      });
      expect(prismaMock.generatedDocument.findUnique).not.toHaveBeenCalled();
    });

    it('DELETE against another tenant\'s id returns 404 (no delete)', async () => {
      prismaMock.generatedDocument.deleteMany.mockResolvedValueOnce({ count: 0 });
      const res = await request(buildApp())
        .delete('/api/documents/doc-belongs-to-B')
        .set('Authorization', `Bearer ${tokenFor('inst-A')}`);
      expect(res.status).toBe(404);
      expect(prismaMock.generatedDocument.deleteMany).toHaveBeenCalledWith({
        where: { id: 'doc-belongs-to-B', institutionId: 'inst-A' },
      });
    });

    it('anonymous list still 401 (regression guard from previous PR)', async () => {
      const res = await request(buildApp()).get('/api/documents');
      expect(res.status).toBe(401);
      expect(prismaMock.generatedDocument.findMany).not.toHaveBeenCalled();
    });
  });

  // ── Architecture ─────────────────────────────────────────────────────────

  describe('/api/architecture', () => {
    it('list scopes findMany by institutionId', async () => {
      prismaMock.architectureAssessment.findMany.mockResolvedValueOnce([]);
      const res = await request(buildApp())
        .get('/api/architecture')
        .set('Authorization', `Bearer ${tokenFor('inst-A')}`);
      expect(res.status).toBe(200);
      expect(prismaMock.architectureAssessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { institutionId: 'inst-A' } }),
      );
    });

    it('tenant A cannot get tenant B\'s assessment (404)', async () => {
      prismaMock.architectureAssessment.findFirst.mockResolvedValueOnce(null);
      const res = await request(buildApp())
        .get('/api/architecture/asm-B1')
        .set('Authorization', `Bearer ${tokenFor('inst-A')}`);
      expect(res.status).toBe(404);
      expect(prismaMock.architectureAssessment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'asm-B1', institutionId: 'inst-A' } }),
      );
    });

    it('DELETE against another tenant\'s id returns 404', async () => {
      prismaMock.architectureAssessment.deleteMany.mockResolvedValueOnce({ count: 0 });
      const res = await request(buildApp())
        .delete('/api/architecture/asm-B1')
        .set('Authorization', `Bearer ${tokenFor('inst-A')}`);
      expect(res.status).toBe(404);
    });

    it('anonymous list still 401', async () => {
      const res = await request(buildApp()).get('/api/architecture');
      expect(res.status).toBe(401);
    });
  });

  // ── Value analyses ───────────────────────────────────────────────────────

  describe('/api/value', () => {
    it('list scopes findMany by institutionId', async () => {
      prismaMock.valueAnalysis.findMany.mockResolvedValueOnce([]);
      const res = await request(buildApp())
        .get('/api/value')
        .set('Authorization', `Bearer ${tokenFor('inst-A')}`);
      expect(res.status).toBe(200);
      expect(prismaMock.valueAnalysis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { institutionId: 'inst-A' } }),
      );
    });

    it('tenant A cannot get tenant B\'s analysis (404)', async () => {
      prismaMock.valueAnalysis.findFirst.mockResolvedValueOnce(null);
      const res = await request(buildApp())
        .get('/api/value/va-B1')
        .set('Authorization', `Bearer ${tokenFor('inst-A')}`);
      expect(res.status).toBe(404);
      expect(prismaMock.valueAnalysis.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'va-B1', institutionId: 'inst-A' } }),
      );
    });

    it('anonymous list still 401', async () => {
      const res = await request(buildApp()).get('/api/value');
      expect(res.status).toBe(401);
    });
  });

  // ── Integration assessments ──────────────────────────────────────────────

  describe('/api/integration', () => {
    it('list scopes findMany by institutionId', async () => {
      prismaMock.integrationAssessment.findMany.mockResolvedValueOnce([]);
      const res = await request(buildApp())
        .get('/api/integration/assess')
        .set('Authorization', `Bearer ${tokenFor('inst-A')}`);
      expect(res.status).toBe(200);
      expect(prismaMock.integrationAssessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { institutionId: 'inst-A' } }),
      );
    });

    it('tenant A cannot get tenant B\'s integration assessment (404)', async () => {
      prismaMock.integrationAssessment.findFirst.mockResolvedValueOnce(null);
      const res = await request(buildApp())
        .get('/api/integration/assess/ia-B1')
        .set('Authorization', `Bearer ${tokenFor('inst-A')}`);
      expect(res.status).toBe(404);
      expect(prismaMock.integrationAssessment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ia-B1', institutionId: 'inst-A' } }),
      );
    });

    it('anonymous list now 401 (router newly gated)', async () => {
      const res = await request(buildApp()).get('/api/integration/assess');
      expect(res.status).toBe(401);
    });
  });
});
