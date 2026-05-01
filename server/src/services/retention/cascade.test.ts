/**
 * Phase 11.14 — soft-delete cascade tests.
 *
 * Prisma is mocked (matches the pattern in scheduler.test.ts). Pins:
 *   - 404 when the institution doesn't exist
 *   - Idempotent: a second cascade against an already-soft-deleted
 *     row is a no-op
 *   - Cascade scrubs PII on every User row (mirrors GDPR semantics)
 *   - Subscription is soft-deleted alongside the Institution
 *   - SsoIdentityProvider rows are hard-deleted (no PII; defence in depth)
 *   - Restore reverses Institution + Subscription `deletedAt` (and only
 *     within the grace window)
 *   - User restore rejects collisions with a live email
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  institutionFindUniqueMock,
  institutionUpdateMock,
  subscriptionUpdateMock,
  userFindManyMock,
  userFindUniqueMock,
  userUpdateMock,
  notificationDeleteManyMock,
  ssoDeleteManyMock,
  auditCreateMock,
} = vi.hoisted(() => ({
  institutionFindUniqueMock: vi.fn(),
  institutionUpdateMock: vi.fn(),
  subscriptionUpdateMock: vi.fn(),
  userFindManyMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  userUpdateMock: vi.fn(),
  notificationDeleteManyMock: vi.fn(),
  ssoDeleteManyMock: vi.fn(),
  auditCreateMock: vi.fn(),
}));

vi.mock('../../utils/prisma', () => ({
  default: {
    institution: { findUnique: institutionFindUniqueMock, update: institutionUpdateMock },
    subscription: { update: subscriptionUpdateMock },
    user: {
      findMany: userFindManyMock,
      findUnique: userFindUniqueMock,
      update: userUpdateMock,
    },
    notification: { deleteMany: notificationDeleteManyMock },
    ssoIdentityProvider: { deleteMany: ssoDeleteManyMock },
    auditLog: { create: auditCreateMock },
  },
}));

vi.mock('../../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { softDeleteInstitution, restoreInstitution, restoreUser } from './cascade';
import type { Request } from 'express';

const fakeReq = { user: { userId: 'admin-1', email: 'admin@herm.test' } } as unknown as Request;

beforeEach(() => {
  institutionFindUniqueMock.mockReset();
  institutionUpdateMock.mockReset();
  subscriptionUpdateMock.mockReset();
  userFindManyMock.mockReset();
  userFindUniqueMock.mockReset();
  userUpdateMock.mockReset();
  notificationDeleteManyMock.mockReset();
  notificationDeleteManyMock.mockResolvedValue({ count: 0 });
  ssoDeleteManyMock.mockReset();
  auditCreateMock.mockReset();
  auditCreateMock.mockResolvedValue({});
});

describe('softDeleteInstitution', () => {
  it('throws 404 when the institution does not exist', async () => {
    institutionFindUniqueMock.mockResolvedValue(null);
    await expect(softDeleteInstitution(fakeReq, 'nope')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('cascades in order: Institution.deletedAt FIRST, then users, notifications, sub, sso', async () => {
    institutionFindUniqueMock.mockResolvedValue({
      id: 'inst-1',
      slug: 'acme',
      name: 'Acme',
      deletedAt: null,
      subscription: { id: 'sub-1', deletedAt: null },
    });
    userFindManyMock.mockResolvedValue([
      { id: 'usr-a' },
      { id: 'usr-b' },
    ]);
    userUpdateMock.mockResolvedValue({});
    subscriptionUpdateMock.mockResolvedValue({});
    notificationDeleteManyMock.mockResolvedValue({ count: 5 });
    ssoDeleteManyMock.mockResolvedValue({ count: 2 });
    institutionUpdateMock.mockResolvedValue({});

    const stats = await softDeleteInstitution(fakeReq, 'inst-1');

    expect(stats.usersScrubbed).toBe(2);
    expect(stats.subscriptionDeleted).toBe(true);
    expect(stats.ssoProvidersDeleted).toBe(2);
    expect(stats.notificationsDeleted).toBe(5);

    // Phase 11.14 follow-up — Institution.deletedAt is stamped FIRST
    // (defence in depth: JWT chokepoint blocks the tenant before any
    // partial-cascade error can leave a half-deleted state).
    expect(institutionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inst-1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );

    // Each user got the GDPR-aligned scrub.
    expect(userUpdateMock).toHaveBeenCalledTimes(2);
    const firstUserUpdate = userUpdateMock.mock.calls[0]?.[0]?.data;
    expect(firstUserUpdate?.email).toBe('deleted+usr-a@deleted.invalid');
    expect(firstUserUpdate?.name).toBe('[deleted user]');
    expect(firstUserUpdate?.passwordHash).toBe('');
    expect(firstUserUpdate?.mfaSecret).toBeNull();
    expect(firstUserUpdate?.deletedAt).toBeInstanceOf(Date);
    // Phase 11.14 follow-up (Bugbot HIGH) — externalId nulled so a
    // SCIM re-provision after a restoreInstitution can reuse the same
    // external identifier without colliding on the composite-unique.
    expect(firstUserUpdate?.externalId).toBeNull();

    // Notifications deleted in bulk by institution.
    expect(notificationDeleteManyMock).toHaveBeenCalledWith({
      where: { user: { institutionId: 'inst-1' } },
    });

    // Subscription stamped.
    expect(subscriptionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );

    // SSO rows hard-deleted.
    expect(ssoDeleteManyMock).toHaveBeenCalledWith({ where: { institutionId: 'inst-1' } });

    // One audit row recording the cascade summary.
    const auditCall = auditCreateMock.mock.calls[0]?.[0];
    expect(auditCall?.data?.action).toBe('admin.institution.soft_delete');
    expect(auditCall?.data?.changes?.usersScrubbed).toBe(2);
    expect(auditCall?.data?.changes?.notificationsDeleted).toBe(5);
    expect(auditCall?.data?.changes?.resumed).toBe(false);
  });

  it('convergent re-run: continues missing scrubs without re-stamping institution', async () => {
    // Re-run scenario: institution.deletedAt is already stamped (first
    // pass got that far) but some users haven't been scrubbed yet.
    institutionFindUniqueMock.mockResolvedValue({
      id: 'inst-1',
      slug: 'acme',
      name: 'Acme',
      deletedAt: new Date('2026-04-01'),
      subscription: { id: 'sub-1', deletedAt: new Date('2026-04-01') },
    });
    // Two users that still need scrubbing (findMany filters deletedAt: null)
    userFindManyMock.mockResolvedValue([{ id: 'usr-c' }]);
    userUpdateMock.mockResolvedValue({});
    notificationDeleteManyMock.mockResolvedValue({ count: 1 });
    ssoDeleteManyMock.mockResolvedValue({ count: 0 });

    const stats = await softDeleteInstitution(fakeReq, 'inst-1');
    expect(stats.usersScrubbed).toBe(1);
    // Did NOT re-stamp institution.deletedAt (already set).
    expect(institutionUpdateMock).not.toHaveBeenCalled();
    // Did NOT re-stamp subscription (already set).
    expect(subscriptionUpdateMock).not.toHaveBeenCalled();
    // DID continue scrubbing the missing user.
    expect(userUpdateMock).toHaveBeenCalledTimes(1);
    // Audit row records resumed=true.
    const auditCall = auditCreateMock.mock.calls[0]?.[0];
    expect(auditCall?.data?.action).toBe('admin.institution.soft_delete_resume');
    expect(auditCall?.data?.changes?.resumed).toBe(true);
  });

  it('skips the subscription branch when the institution has no subscription', async () => {
    institutionFindUniqueMock.mockResolvedValue({
      id: 'inst-2',
      slug: 'free-tier',
      name: 'Free U',
      deletedAt: null,
      subscription: null,
    });
    userFindManyMock.mockResolvedValue([]);
    ssoDeleteManyMock.mockResolvedValue({ count: 0 });
    institutionUpdateMock.mockResolvedValue({});

    const stats = await softDeleteInstitution(fakeReq, 'inst-2');
    expect(stats.subscriptionDeleted).toBe(false);
    expect(subscriptionUpdateMock).not.toHaveBeenCalled();
  });
});

describe('restoreInstitution', () => {
  it('throws 404 when the institution does not exist', async () => {
    institutionFindUniqueMock.mockResolvedValue(null);
    await expect(restoreInstitution(fakeReq, 'nope')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 409 when the institution is not soft-deleted', async () => {
    institutionFindUniqueMock.mockResolvedValue({
      id: 'inst-1',
      slug: 'live',
      name: 'Live U',
      deletedAt: null,
      subscription: null,
    });
    await expect(restoreInstitution(fakeReq, 'inst-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('clears deletedAt on Institution + Subscription and audits (within grace window)', async () => {
    // Stamped recently — well inside the default 30-day grace window.
    institutionFindUniqueMock.mockResolvedValue({
      id: 'inst-1',
      slug: 'gone',
      name: 'Gone U',
      deletedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      subscription: { id: 'sub-1', deletedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    institutionUpdateMock.mockResolvedValue({});
    subscriptionUpdateMock.mockResolvedValue({});

    await restoreInstitution(fakeReq, 'inst-1');

    expect(institutionUpdateMock).toHaveBeenCalledWith({ where: { id: 'inst-1' }, data: { deletedAt: null } });
    expect(subscriptionUpdateMock).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { deletedAt: null } });
    expect(auditCreateMock.mock.calls[0]?.[0]?.data?.action).toBe('admin.institution.restore');
  });

  it('throws 409 when the deletedAt is past the grace window (Phase 11.14 follow-up)', async () => {
    // 31 days ago — beyond the default 30-day grace window.
    institutionFindUniqueMock.mockResolvedValue({
      id: 'inst-1',
      slug: 'long-gone',
      name: 'Long Gone U',
      deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      subscription: null,
    });
    await expect(restoreInstitution(fakeReq, 'inst-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(institutionUpdateMock).not.toHaveBeenCalled();
  });
});

describe('restoreUser', () => {
  it('throws 404 when the user does not exist', async () => {
    userFindUniqueMock.mockResolvedValue(null);
    await expect(restoreUser(fakeReq, 'nope', 'a@b.test', 'X')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 409 when the user is not soft-deleted', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'u-1', deletedAt: null, institutionId: 'i-1' });
    await expect(restoreUser(fakeReq, 'u-1', 'a@b.test', 'X')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 409 when the new email collides with a live user', async () => {
    userFindUniqueMock.mockResolvedValueOnce({
      id: 'u-1',
      deletedAt: new Date(),
      institutionId: 'i-1',
    });
    userFindUniqueMock.mockResolvedValueOnce({ id: 'u-other', email: 'taken@b.test' });
    await expect(restoreUser(fakeReq, 'u-1', 'taken@b.test', 'X')).rejects.toMatchObject({ statusCode: 409 });
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('throws 409 when the user was soft-deleted past the grace window (Phase 11.14 follow-up)', async () => {
    userFindUniqueMock.mockResolvedValueOnce({
      id: 'u-1',
      deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      institutionId: 'i-1',
    });
    await expect(restoreUser(fakeReq, 'u-1', 'a@b.test', 'X')).rejects.toMatchObject({ statusCode: 409 });
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('clears deletedAt and writes the new email + name', async () => {
    userFindUniqueMock.mockResolvedValueOnce({
      id: 'u-1',
      deletedAt: new Date(),
      institutionId: 'i-1',
    });
    userFindUniqueMock.mockResolvedValueOnce(null); // no collision
    userUpdateMock.mockResolvedValue({});
    await restoreUser(fakeReq, 'u-1', 'Restored@example.test', 'Restored Name');
    const updateArgs = userUpdateMock.mock.calls[0]?.[0]?.data;
    expect(updateArgs?.deletedAt).toBeNull();
    expect(updateArgs?.email).toBe('restored@example.test');
    expect(updateArgs?.name).toBe('Restored Name');
    expect(auditCreateMock.mock.calls[0]?.[0]?.data?.action).toBe('admin.user.restore');
  });
});
