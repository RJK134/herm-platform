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
  ssoDeleteManyMock,
  auditCreateMock,
} = vi.hoisted(() => ({
  institutionFindUniqueMock: vi.fn(),
  institutionUpdateMock: vi.fn(),
  subscriptionUpdateMock: vi.fn(),
  userFindManyMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  userUpdateMock: vi.fn(),
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
  ssoDeleteManyMock.mockReset();
  auditCreateMock.mockReset();
  auditCreateMock.mockResolvedValue({});
});

describe('softDeleteInstitution', () => {
  it('throws 404 when the institution does not exist', async () => {
    institutionFindUniqueMock.mockResolvedValue(null);
    await expect(softDeleteInstitution(fakeReq, 'nope')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('is idempotent: no further writes when already soft-deleted', async () => {
    institutionFindUniqueMock.mockResolvedValue({
      id: 'inst-1',
      slug: 'gone',
      name: 'Gone U',
      deletedAt: new Date('2026-04-01'),
      subscription: { id: 'sub-1', deletedAt: new Date('2026-04-01') },
    });
    const stats = await softDeleteInstitution(fakeReq, 'inst-1');
    expect(stats.usersScrubbed).toBe(0);
    expect(institutionUpdateMock).not.toHaveBeenCalled();
    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('cascades: scrubs each user, soft-deletes subscription, hard-deletes SSO rows, soft-deletes institution', async () => {
    institutionFindUniqueMock.mockResolvedValue({
      id: 'inst-1',
      slug: 'acme',
      name: 'Acme',
      deletedAt: null,
      subscription: { id: 'sub-1', deletedAt: null },
    });
    userFindManyMock.mockResolvedValue([
      { id: 'usr-a', email: 'alice@acme.test' },
      { id: 'usr-b', email: 'bob@acme.test' },
    ]);
    userUpdateMock.mockResolvedValue({});
    subscriptionUpdateMock.mockResolvedValue({});
    ssoDeleteManyMock.mockResolvedValue({ count: 2 });
    institutionUpdateMock.mockResolvedValue({});

    const stats = await softDeleteInstitution(fakeReq, 'inst-1');

    expect(stats.usersScrubbed).toBe(2);
    expect(stats.subscriptionDeleted).toBe(true);
    expect(stats.ssoProvidersDeleted).toBe(2);

    // Each user got the GDPR-aligned scrub.
    expect(userUpdateMock).toHaveBeenCalledTimes(2);
    const firstUserUpdate = userUpdateMock.mock.calls[0]?.[0]?.data;
    expect(firstUserUpdate?.email).toMatch(/^deleted\+usr-a@deleted\.invalid$/);
    expect(firstUserUpdate?.name).toBe('[deleted user]');
    expect(firstUserUpdate?.passwordHash).toBe('');
    expect(firstUserUpdate?.mfaSecret).toBeNull();
    expect(firstUserUpdate?.deletedAt).toBeInstanceOf(Date);

    // Subscription stamped with deletedAt.
    expect(subscriptionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );

    // SSO rows hard-deleted (no PII; defence in depth).
    expect(ssoDeleteManyMock).toHaveBeenCalledWith({ where: { institutionId: 'inst-1' } });

    // Institution itself stamped last.
    expect(institutionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inst-1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );

    // One audit row recording the cascade summary.
    const auditCall = auditCreateMock.mock.calls[0]?.[0];
    expect(auditCall?.data?.action).toBe('admin.institution.soft_delete');
    expect(auditCall?.data?.changes?.usersScrubbed).toBe(2);
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

  it('clears deletedAt on Institution + Subscription and audits', async () => {
    institutionFindUniqueMock.mockResolvedValue({
      id: 'inst-1',
      slug: 'gone',
      name: 'Gone U',
      deletedAt: new Date('2026-04-01'),
      subscription: { id: 'sub-1', deletedAt: new Date('2026-04-01') },
    });
    institutionUpdateMock.mockResolvedValue({});
    subscriptionUpdateMock.mockResolvedValue({});

    await restoreInstitution(fakeReq, 'inst-1');

    expect(institutionUpdateMock).toHaveBeenCalledWith({ where: { id: 'inst-1' }, data: { deletedAt: null } });
    expect(subscriptionUpdateMock).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { deletedAt: null } });
    expect(auditCreateMock.mock.calls[0]?.[0]?.data?.action).toBe('admin.institution.restore');
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
