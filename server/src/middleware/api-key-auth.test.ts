/**
 * Tests for the API-key auth middleware. Mocks Prisma so we can drive the
 * various paths (no key, non-API-key bearer, valid key, revoked key, expired
 * key, unknown key) deterministically.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    apiKey: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('../utils/prisma', () => ({ default: prismaMock }));
vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { apiKeyAuth, requireApiPermission } from './api-key-auth';

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function makeReq(authorization?: string): Request {
  return {
    headers: authorization ? { authorization } : {},
  } as unknown as Request;
}

function makeRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

beforeEach(() => {
  prismaMock.apiKey.findUnique.mockReset();
  prismaMock.apiKey.update.mockReset();
  prismaMock.apiKey.update.mockResolvedValue({});
});

describe('apiKeyAuth — pass-through cases', () => {
  it('is a pass-through when there is no Authorization header', async () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    await apiKeyAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(prismaMock.apiKey.findUnique).not.toHaveBeenCalled();
    expect(req.apiUser).toBeUndefined();
  });

  it('is a pass-through when the bearer does not start with herm_pk_ (lets JWT chain handle)', async () => {
    const req = makeReq('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake');
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    await apiKeyAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(prismaMock.apiKey.findUnique).not.toHaveBeenCalled();
    expect(req.apiUser).toBeUndefined();
  });
});

describe('apiKeyAuth — happy path', () => {
  it('attaches req.apiUser when the key is valid + active + unexpired', async () => {
    const raw = 'herm_pk_abc';
    prismaMock.apiKey.findUnique.mockResolvedValueOnce({
      id: 'key-1',
      institutionId: 'inst-1',
      permissions: ['read:systems', 'read:capabilities'],
      isActive: true,
      expiresAt: null,
    });
    const req = makeReq(`Bearer ${raw}`);
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await apiKeyAuth(req, res, next);

    expect(prismaMock.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { keyHash: hashKey(raw) } }),
    );
    expect(req.apiUser).toEqual({
      id: 'key-1',
      institutionId: 'inst-1',
      permissions: ['read:systems', 'read:capabilities'],
      tier: 'enterprise',
    });
    expect(next).toHaveBeenCalledOnce();
  });

  it('updates lastUsedAt async without blocking the request', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValueOnce({
      id: 'key-2',
      institutionId: 'inst-2',
      permissions: ['read:systems'],
      isActive: true,
      expiresAt: null,
    });
    const req = makeReq('Bearer herm_pk_xyz');
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await apiKeyAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    // Allow the async fire-and-forget update to flush.
    await new Promise((r) => setImmediate(r));
    expect(prismaMock.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'key-2' },
        data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      }),
    );
  });
});

describe('apiKeyAuth — rejection paths', () => {
  it('returns 401 API_KEY_INVALID when no row matches the hash', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValueOnce(null);
    const req = makeReq('Bearer herm_pk_unknown');
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await apiKeyAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'API_KEY_INVALID' }),
      }),
    );
  });

  it('returns 401 API_KEY_INVALID for a revoked (isActive=false) key', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValueOnce({
      id: 'key-3',
      institutionId: 'inst-3',
      permissions: [],
      isActive: false,
      expiresAt: null,
    });
    const req = makeReq('Bearer herm_pk_revoked');
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await apiKeyAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'API_KEY_INVALID' }),
      }),
    );
  });

  it('returns 401 API_KEY_EXPIRED when expiresAt has passed', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValueOnce({
      id: 'key-4',
      institutionId: 'inst-4',
      permissions: ['read:systems'],
      isActive: true,
      expiresAt: new Date(Date.now() - 60_000), // one minute ago
    });
    const req = makeReq('Bearer herm_pk_old');
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await apiKeyAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'API_KEY_EXPIRED' }),
      }),
    );
  });

  it('accepts a key whose expiresAt is in the future', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValueOnce({
      id: 'key-5',
      institutionId: 'inst-5',
      permissions: ['read:systems'],
      isActive: true,
      expiresAt: new Date(Date.now() + 60_000), // one minute from now
    });
    const req = makeReq('Bearer herm_pk_fresh');
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await apiKeyAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.apiUser?.id).toBe('key-5');
  });
});

describe('requireApiPermission', () => {
  it('returns 401 when no apiUser is attached', () => {
    const mw = requireApiPermission('read:systems');
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 INSUFFICIENT_SCOPE when the key lacks the named permission', () => {
    const mw = requireApiPermission('read:scores');
    const req = makeReq();
    req.apiUser = {
      id: 'k',
      institutionId: 'i',
      permissions: ['read:systems'],
      tier: 'enterprise',
    };
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'API_KEY_INSUFFICIENT_SCOPE' }),
      }),
    );
  });

  it('passes when the key holds the named permission', () => {
    const mw = requireApiPermission('read:systems');
    const req = makeReq();
    req.apiUser = {
      id: 'k',
      institutionId: 'i',
      permissions: ['read:systems'],
      tier: 'enterprise',
    };
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
