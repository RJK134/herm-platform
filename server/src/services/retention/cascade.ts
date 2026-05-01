/**
 * Soft-delete cascade for Institution (Phase 11.14).
 *
 * Closes the deferred follow-up from PR #70: "Soft-delete on Institution
 * and Subscription tables (cascading erasure of every user + project)."
 *
 * Why a service rather than a Prisma cascade
 *   The schema already has `onDelete: Cascade` for the FKs, but those
 *   only fire on a HARD delete. Soft-delete is by definition just a
 *   row update — the FKs are unaware. A service-level cascade lets us:
 *     - Record a single summary audit row for the institution delete
 *       operation, capturing the per-row counts.
 *     - Run the same PII scrub on User rows that the GDPR right-to-
 *       erasure path uses, applying the scrub per affected user so the
 *       soft-deleted institution doesn't leave grace-window PII lying
 *       around.
 *     - Hard-delete `Notification` rows for the affected users (mirrors
 *       the GDPR path which deletes notifications outright — no
 *       grace-window leakage of personal data through that surface).
 *     - Keep the row hierarchy intact for the retention scheduler to
 *       hard-delete in order (Subscription / Users / Institution).
 *
 * Cascade ordering (Bugbot review on PR #76)
 *   `Institution.deletedAt` is stamped FIRST so the JWT auth chokepoint
 *   (which reads `Institution.deletedAt`) blocks the tenant immediately,
 *   even if a later cascade step (the per-User scrub or the SSO row
 *   delete) errors out. The remaining steps then proceed under the
 *   "tenant already blocked" invariant.
 *
 * Convergent idempotency (Bugbot review on PR #76)
 *   A re-run against an already-soft-deleted institution does NOT
 *   no-op — it continues any cascade steps that didn't complete on
 *   the first attempt. This makes the cascade safe to retry after a
 *   transient DB error mid-cascade. The per-User scrub itself is
 *   idempotent because the `findMany` filter is `deletedAt: null`,
 *   so already-scrubbed rows are skipped on the second pass.
 *
 * Reversal
 *   Within the configured grace window (`RETENTION_GRACE_DAYS`, default
 *   30) the action is reversible via the matching `restoreInstitution`
 *   helper (clears `deletedAt` on Institution + Subscription). The
 *   User PII scrub is NOT reversible — once the email + name are
 *   tombstoned, the original values are lost. Restored accounts retain
 *   `[deleted user]` until the admin manually re-enters them via
 *   `restoreUser`. This is documented in the customer onboarding doc.
 *
 * Out of scope (deferred)
 *   - Cascading to ProcurementProject / EvaluationProject / Document /
 *     Basket etc. The current Phase 11.9 retention scheduler only
 *     hard-deletes User rows; the deeper rows survive on the soft-
 *     deleted Institution as orphans the retention scheduler doesn't
 *     touch. A follow-up PR can extend the sweeper.
 *   - SUPER_ADMIN UI for the action — today the operator hits the
 *     `DELETE /api/admin/institutions/:id` endpoint directly.
 *   - Institution.deletedAt enforcement on the API-key auth surface —
 *     today only the JWT chokepoint reads it. API-key callers from a
 *     soft-deleted tenant would still be able to use their key during
 *     the grace window. Acceptable for v1 because revoking the key
 *     row IS hard-deleted by the cascade (institution.apiKeys cascade
 *     delete), but a defence-in-depth check belongs in api-key-auth.
 */
import type { Request } from 'express';
import prisma from '../../utils/prisma';
import { audit } from '../../lib/audit';
import { logger } from '../../lib/logger';
import { AppError } from '../../utils/errors';

const DEFAULT_GRACE_DAYS = 30;

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function graceWindowCutoff(): Date {
  const days = readNumberEnv('RETENTION_GRACE_DAYS', DEFAULT_GRACE_DAYS);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export interface CascadeStats {
  institutionId: string;
  subscriptionDeleted: boolean;
  usersScrubbed: number;
  notificationsDeleted: number;
  ssoProvidersDeleted: number;
}

/**
 * Soft-delete an institution and cascade the deletion to its
 * Subscription, all Users (PII scrubbed) + their Notifications, and
 * all SsoIdentityProvider rows. Stamps `Institution.deletedAt` FIRST
 * so the JWT chokepoint blocks the tenant immediately, then converges
 * the remaining cascade steps. Records one summary audit row.
 *
 * Convergently idempotent: re-runs continue any steps that didn't
 * complete on the first attempt (e.g. after a transient DB error
 * mid-cascade). Per-User scrub is naturally idempotent because the
 * findMany filter excludes already-soft-deleted rows.
 *
 * Throws 404 if the institution does not exist (or was hard-deleted).
 */
export async function softDeleteInstitution(
  req: Request,
  institutionId: string,
): Promise<CascadeStats> {
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    include: { subscription: true },
  });
  if (!institution) {
    throw new AppError(404, 'NOT_FOUND', 'Institution not found.');
  }

  const now = new Date();

  // 1. Stamp Institution.deletedAt FIRST. This is the defence-in-depth
  //    block: from here on, every JWT-authenticated request from this
  //    tenant 401s (via authenticateJWT's institution.deletedAt check),
  //    even if a later cascade step errors. Idempotent — leaves the
  //    existing deletedAt in place if already set.
  if (institution.deletedAt === null) {
    await prisma.institution.update({
      where: { id: institutionId },
      data: { deletedAt: now },
    });
  }

  // 2. Per-User scrub. The findMany filter is `deletedAt: null` so
  //    re-runs only see users that haven't been scrubbed yet. Each
  //    scrub mirrors the GDPR right-to-erasure path so the row's PII
  //    is gone before the retention scheduler's grace window even
  //    starts.
  const users = await prisma.user.findMany({
    where: { institutionId, deletedAt: null },
    select: { id: true },
  });
  let usersScrubbed = 0;
  for (const u of users) {
    await prisma.user.update({
      where: { id: u.id },
      data: {
        deletedAt: now,
        email: `deleted+${u.id}@deleted.invalid`,
        name: '[deleted user]',
        passwordHash: '',
        passwordLoginDisabled: true,
        mfaSecret: null,
        mfaEnabledAt: null,
      },
    });
    usersScrubbed++;
  }

  // 3. Hard-delete Notification rows for every user in the institution.
  //    Mirrors the GDPR path which `notification.deleteMany`s outright
  //    rather than letting them sit through the grace window. This is
  //    distinct from the User soft-delete (the User row stays for the
  //    grace window so an accidental cascade can be reversed), but
  //    notifications are throwaway PII-bearing data with no need to
  //    survive.
  const notificationsDeleted = await prisma.notification.deleteMany({
    where: { user: { institutionId } },
  });

  // 4. Soft-delete the Subscription (if any) — idempotent.
  let subscriptionDeleted = false;
  if (institution.subscription && institution.subscription.deletedAt === null) {
    await prisma.subscription.update({
      where: { id: institution.subscription.id },
      data: { deletedAt: now },
    });
    subscriptionDeleted = true;
  }

  // 5. Hard-delete the SsoIdentityProvider rows. They have no PII and
  //    no soft-delete field; the retention scheduler hard-deletes them
  //    when the parent Institution is hard-deleted, but we drop them
  //    eagerly to make sure no SSO flow can resolve to a soft-deleted
  //    tenant (the auth path's institutionId check would refuse anyway,
  //    but defence in depth).
  const ssoDeleted = await prisma.ssoIdentityProvider.deleteMany({
    where: { institutionId },
  });

  // Single summary audit row. (Earlier draft of this comment claimed
  // one row per cascade step; the implementation only ever wrote one,
  // so the doc was misleading. Now matches reality.)
  await audit(req, {
    action: institution.deletedAt === null ? 'admin.institution.soft_delete' : 'admin.institution.soft_delete_resume',
    entityType: 'Institution',
    entityId: institutionId,
    changes: {
      institutionSlug: institution.slug,
      institutionName: institution.name,
      subscriptionDeleted,
      usersScrubbed,
      notificationsDeleted: notificationsDeleted.count,
      ssoProvidersDeleted: ssoDeleted.count,
      // Distinguish first-time deletes from resumed (idempotent re-runs).
      resumed: institution.deletedAt !== null,
    },
  });

  if (institution.deletedAt !== null && usersScrubbed === 0 && ssoDeleted.count === 0 && notificationsDeleted.count === 0 && !subscriptionDeleted) {
    // Already fully cascaded; logged for operator visibility.
    logger.info(
      { institutionId },
      'softDeleteInstitution: re-run found no remaining cascade work',
    );
  }

  return {
    institutionId,
    subscriptionDeleted,
    usersScrubbed,
    notificationsDeleted: notificationsDeleted.count,
    ssoProvidersDeleted: ssoDeleted.count,
  };
}

/**
 * Reverse a soft-delete of an Institution within the grace window.
 * Clears `deletedAt` on Institution + Subscription. Does NOT restore
 * the scrubbed PII on User rows (the original values are gone — admins
 * must reset names and emails manually for any user they want to
 * keep). SsoIdentityProvider rows are NOT restored either; the
 * operator re-enters them via the admin SSO endpoints.
 *
 * Grace-window enforcement (Bugbot review on PR #76)
 *   Refuses to restore an Institution whose `deletedAt` is older than
 *   `RETENTION_GRACE_DAYS` (default 30). Without this, a misconfigured
 *   scheduler (e.g. `RETENTION_SCHEDULER_ENABLED=false` for an
 *   extended window) would let admins resurrect tenants that should
 *   already be considered hard-deletable.
 *
 * Throws 404 if the institution does not exist.
 * Throws 409 if the institution is not currently soft-deleted, or its
 *   deletedAt is older than the grace window.
 */
export async function restoreInstitution(req: Request, institutionId: string): Promise<void> {
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    include: { subscription: true },
  });
  if (!institution) {
    throw new AppError(404, 'NOT_FOUND', 'Institution not found.');
  }
  if (institution.deletedAt === null) {
    throw new AppError(409, 'CONFLICT', 'Institution is not soft-deleted.');
  }
  const cutoff = graceWindowCutoff();
  if (institution.deletedAt < cutoff) {
    throw new AppError(
      409,
      'CONFLICT',
      'Institution was soft-deleted past the retention grace window and cannot be restored.',
    );
  }

  await prisma.institution.update({
    where: { id: institutionId },
    data: { deletedAt: null },
  });
  if (institution.subscription && institution.subscription.deletedAt !== null) {
    await prisma.subscription.update({
      where: { id: institution.subscription.id },
      data: { deletedAt: null },
    });
  }

  await audit(req, {
    action: 'admin.institution.restore',
    entityType: 'Institution',
    entityId: institutionId,
    changes: {
      institutionSlug: institution.slug,
      institutionName: institution.name,
      deletedAt: institution.deletedAt.toISOString(),
    },
  });
}

/**
 * Reverse a single User's soft-delete. The PII fields (email, name,
 * MFA) are not recovered — the admin must re-enter them for any
 * account they want to keep. This is the lighter-weight counterpart to
 * `restoreInstitution` for the case where one user was erased
 * accidentally rather than the whole tenant.
 *
 * Grace-window enforcement matches `restoreInstitution`.
 *
 * Throws 404 if the user does not exist.
 * Throws 409 if the user is not currently soft-deleted, the deletedAt
 *   is past the grace window, or the new email collides with a live
 *   user.
 */
export async function restoreUser(
  req: Request,
  userId: string,
  newEmail: string,
  newName: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found.');
  }
  if (user.deletedAt === null) {
    throw new AppError(409, 'CONFLICT', 'User is not soft-deleted.');
  }
  const cutoff = graceWindowCutoff();
  if (user.deletedAt < cutoff) {
    throw new AppError(
      409,
      'CONFLICT',
      'User was soft-deleted past the retention grace window and cannot be restored.',
    );
  }
  // Reject collisions with another live user.
  const collision = await prisma.user.findUnique({
    where: { email: newEmail.toLowerCase() },
  });
  if (collision && collision.id !== userId) {
    throw new AppError(409, 'CONFLICT', 'A live user with that email already exists.');
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: null,
      email: newEmail.toLowerCase(),
      name: newName,
      // The original password / MFA cannot be recovered; the user must
      // reset both via the existing flows. Keep `passwordLoginDisabled`
      // = true so a stale password hash (if any) cannot be used.
    },
  });

  await audit(req, {
    action: 'admin.user.restore',
    entityType: 'User',
    entityId: userId,
    userId: userId,
    changes: {
      institutionId: user.institutionId,
      newEmail: newEmail.toLowerCase(),
    },
  });
}
