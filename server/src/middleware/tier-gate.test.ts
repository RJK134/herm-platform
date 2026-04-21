import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { tierGate } from './tier-gate';

function makeMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function makeMockReq(overrides: Partial<Request> = {}): Request {
  return {
    user: undefined,
    framework: undefined,
    ...overrides,
  } as unknown as Request;
}

describe('tierGate middleware', () => {
  it('passes through for public framework with anonymous user', () => {
    const req = makeMockReq({
      framework: {
        id: 'fw1',
        slug: 'herm',
        name: 'HERM',
        isPublic: true,
        isDefault: true,
        licenceType: 'CC-BY-NC-SA-4.0',
        publisher: 'CAUDIT',
        licenceUrl: null,
        licenceNotice: null,
      },
      // user is undefined (anonymous)
    });
    const res = makeMockRes();
    const next = vi.fn() as unknown as NextFunction;

    tierGate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 for non-public framework with anonymous user', () => {
    const req = makeMockReq({
      framework: {
        id: 'fw2',
        slug: 'fhe',
        name: 'FHE Framework',
        isPublic: false,
        isDefault: false,
        licenceType: 'PROPRIETARY',
        publisher: 'FHE',
        licenceUrl: null,
        licenceNotice: null,
      },
      // user is undefined (anonymous)
    });
    const res = makeMockRes();
    const next = vi.fn() as unknown as NextFunction;

    tierGate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'AUTHORIZATION_ERROR',
          message: expect.stringContaining('Upgrade'),
        }),
      }),
    );
  });

  it('returns 403 for non-public framework with free-tier user', () => {
    const req = makeMockReq({
      framework: {
        id: 'fw2',
        slug: 'fhe',
        name: 'FHE Framework',
        isPublic: false,
        isDefault: false,
        licenceType: 'PROPRIETARY',
        publisher: 'FHE',
        licenceUrl: null,
        licenceNotice: null,
      },
      user: {
        userId: 'u1',
        email: 'free@test.com',
        name: 'Free User',
        role: 'user',
        institutionId: 'inst1',
        institutionName: 'Test Uni',
        tier: 'free',
      },
    });
    const res = makeMockRes();
    const next = vi.fn() as unknown as NextFunction;

    tierGate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'AUTHORIZATION_ERROR',
        }),
      }),
    );
  });

  it('passes through for non-public framework with professional-tier user', () => {
    const req = makeMockReq({
      framework: {
        id: 'fw2',
        slug: 'fhe',
        name: 'FHE Framework',
        isPublic: false,
        isDefault: false,
        licenceType: 'PROPRIETARY',
        publisher: 'FHE',
        licenceUrl: null,
        licenceNotice: null,
      },
      user: {
        userId: 'u2',
        email: 'pro@test.com',
        name: 'Pro User',
        role: 'user',
        institutionId: 'inst1',
        institutionName: 'Test Uni',
        tier: 'professional',
      },
    });
    const res = makeMockRes();
    const next = vi.fn() as unknown as NextFunction;

    tierGate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes through for non-public framework with enterprise-tier user', () => {
    const req = makeMockReq({
      framework: {
        id: 'fw2',
        slug: 'fhe',
        name: 'FHE Framework',
        isPublic: false,
        isDefault: false,
        licenceType: 'PROPRIETARY',
        publisher: 'FHE',
        licenceUrl: null,
        licenceNotice: null,
      },
      user: {
        userId: 'u3',
        email: 'ent@test.com',
        name: 'Enterprise User',
        role: 'user',
        institutionId: 'inst1',
        institutionName: 'Test Uni',
        tier: 'enterprise',
      },
    });
    const res = makeMockRes();
    const next = vi.fn() as unknown as NextFunction;

    tierGate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 500 if framework context is missing', () => {
    const req = makeMockReq({
      // framework is undefined -- middleware ran before frameworkContext
    });
    const res = makeMockRes();
    const next = vi.fn() as unknown as NextFunction;

    tierGate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
          message: expect.stringContaining('frameworkContext'),
        }),
      }),
    );
  });
});
