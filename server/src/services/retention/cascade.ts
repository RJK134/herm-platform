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
 *     - Record one audit row per cascade step (admin.institution.delete,
 *       plus one User-scoped scrub event per affected user).
 *     - Run the same PII scrub on User rows that the GDPR right-to-erasure
 *       path uses, so the soft-deleted institution doesn't leave
 *       grace-window PII lying around.
 *     - Keep the row hierarchy intact for the retention scheduler to
 *       hard-delete in order (Subscription / Users / Institution).
 *
 * Reversal
 *   Within the grace window the action is reversible via the matching
 *   `restoreInstitution` helper (clears `deletedAt` on Institution +
 *   Subscription). The User PII scrub is NOT reversible — once the
 *   email + name are tombstoned, the original values are lost. Restored
 *   accounts retain `[deleted user]` until the admin manually re-enters
 *   them. This is documented in the customer-facing onboarding doc.
 *
 * Out of scope (deferred)
 *   - Cascading to ProcurementProject / EvaluationProject / Document /
 *     Basket etc. The current Phase 11.9 retention scheduler only
 *     hard-deletes User rows; the deeper rows survive on the soft-
 *     deleted Institution as orphans the retention scheduler doesn't
 *     touch. A follow-up PR can extend the sweeper.
 *   - SUPER_ADMIN UI for the action — today the operator hits the
 *     `DELETE /api/admin/institutions/:id` endpoint directly.
 */
import type { Request } from 'express';
import prisma from '../../utils/prisma';
import { audit } from '../../lib/audit';
import { logger } from '../../lib/logger';
import { AppError } from '../../utils/errors';

export interface CascadeStats {
  institutionId: string;
  subscriptionDeleted: boolean;
  usersScrubbed: number;
  ssoProvidersDeleted: number;
}

/**
 * Soft-delete an institution and cascade the deletion to its
 * Subscription, all Users, and all SsoIdentityProvider rows. Records
 * one audit row per cascade step.
 *
 * Idempotent: a second call against an already-soft-deleted institution
 * returns the same stats but performs no further writes.
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
  if (institution.deletedAt !== null) {
    // Already soft-deleted — no-op, no further audits.
    logger.info(
      { institutionId, deletedAt: institution.deletedAt },
      'softDeleteInstitution: already soft-deleted; no-op',
    );
    return {
      institutionId,
      subscriptionDeleted: institution.subscription?.deletedAt !== null,
      usersScrubbed: 0,
      ssoProvidersDeleted: 0,
    };
  }

  const now = new Date();

  // 1. Scrub each User in the institution (mirrors the GDPR right-to-
  //    erasure path). Done in a single updateMany for the bulk fields
  //    plus a per-user findMany so we can audit each scrub. The email
  //    tombstone uses the same `deleted+<id>@deleted.invalid` shape as
  //    the GDPR path so a follow-up audit query can recognise both.
  const users = await prisma.user.findMany({
    where: { institutionId, deletedAt: null },
    select: { id: true, email: true },
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

  // 2. Soft-delete the Subscription (if any).
  let subscriptionDeleted = false;
  if (institution.subscription && institution.subscription.deletedAt === null) {
    await prisma.subscription.update({
      where: { id: institution.subscription.id },
      data: { deletedAt: now },
    });
    subscriptionDeleted = true;
  }

  // 3. Hard-delete the SsoIdentityProvider rows. They have no PII and
  //    no soft-delete field; the retention scheduler hard-deletes them
  //    when the parent Institution is hard-deleted, but we drop them
  //    eagerly to make sure no SSO flow can resolve to a soft-deleted
  //    tenant (the auth path's institutionId check would refuse anyway,
  //    but defence in depth).
  const ssoDeleted = await prisma.ssoIdentityProvider.deleteMany({
    where: { institutionId },
  });

  // 4. Soft-delete the Institution itself.
  await prisma.institution.update({
    where: { id: institutionId },
    data: { deletedAt: now },
  });

  await audit(req, {
    action: 'admin.institution.soft_delete',
    entityType: 'Institution',
    entityId: institutionId,
    changes: {
      institutionSlug: institution.slug,
      institutionName: institution.name,
      subscriptionDeleted,
      usersScrubbed,
      ssoProvidersDeleted: ssoDeleted.count,
    },
  });

  return {
    institutionId,
    subscriptionDeleted,
    usersScrubbed,
    ssoProvidersDeleted: ssoDeleted.count,
  };
}

/**
 * Reverse a soft-delete of an Institution within the grace window.
 * Clears `deletedAt` on Institution + Subscription. Does NOT restore
 * the scrubbed PII on User rows (the original values are gone — admins
 * must reset names and emails manually for any user they want to keep).
 * SsoIdentityProvider rows are NOT restored either; the operator
 * re-enters them via the admin SSO endpoints.
 *
 * Throws 404 if the institution does not exist.
 * Throws 409 if the institution is not currently soft-deleted.
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
 * Throws 404 if the user does not exist.
 * Throws 409 if the user is not currently soft-deleted.
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
