import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requirePaidTier } from './require-paid-tier';
import type { JwtPayload } from './auth';

function makeRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    userId: 'u1',
    email: 'u@test.com',
    name: 'Test User',
    role: 'VIEWER',
    institutionId: 'inst1',
    institutionName: 'Test Institution',
    tier: 'free',
    ...overrides,
  };
}

describe('requirePaidTier middleware', () => {
  it('returns 401 for anonymous requests', () => {
    const mw = requirePaidTier();
    const req = { user: undefined, id: 'req-1' } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    mw(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'AUTHENTICATION_ERROR' }),
      }),
    );
  });

  it('returns 403 SUBSCRIPTION_REQUIRED for free-tier users on the default gate', () => {
    const mw = requirePaidTier();
    const req = { user: makeUser({ tier: 'free' }), id: 'req-2' } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    mw(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'SUBSCRIPTION_REQUIRED',
          details: expect.objectContaining({ currentTier: 'free' }),
        }),
      }),
    );
  });

  it('allows professional-tier users through the default gate', () => {
    const mw = requirePaidTier();
    const req = { user: makeUser({ tier: 'pro' }), id: 'req-3' } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    mw(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects professional-tier users on an enterprise-only gate', () => {
    const mw = requirePaidTier(['enterprise']);
    const req = { user: makeUser({ tier: 'pro' }), id: 'req-4' } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    mw(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'SUBSCRIPTION_REQUIRED',
          details: expect.objectContaining({
            requiredTiers: ['enterprise'],
            currentTier: 'pro',
          }),
        }),
      }),
    );
  });

  it('lets SUPER_ADMIN pass regardless of tier', () => {
    const mw = requirePaidTier(['enterprise']);
    const req = {
      user: makeUser({ role: 'SUPER_ADMIN', tier: 'free' }),
      id: 'req-5',
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    mw(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('normalises tier casing', () => {
    const mw = requirePaidTier(['ENTERPRISE']);
    const req = { user: makeUser({ tier: 'Enterprise' }), id: 'req-6' } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    mw(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
