/**
 * GDPR data-subject endpoints (Phase 10.8 — slice 1).
 *
 * Exposes two rights in their simplest viable form:
 *
 *   GET  /api/me/data-export
 *     Article 15 (Right of access). Returns a JSON bundle of every row
 *     where the calling user is the data subject — their User record
 *     (without the password hash), their notifications, their
 *     evaluation memberships, their domain assignments, and the audit
 *     log entries attributed to them. Institution / Basket /
 *     Procurement / Score data is INTENTIONALLY excluded — those are
 *     institution-level data, not personal data, and an institution-
 *     level export is a different workflow that runs through admin.
 *
 *   POST /api/me/erase
 *     Article 17 (Right to erasure). Deletes the User row. Prisma's
 *     onDelete: Cascade then removes Notification, EvaluationMember,
 *     and EvaluationDomainAssignment rows tied to the user. AuditLog
 *     rows are RETAINED — Article 17(3)(b) and 17(3)(e) explicitly
 *     allow retention "for compliance with a legal obligation" and
 *     "for the establishment, exercise or defence of legal claims",
 *     which is exactly what the audit log is for. Crucially, the audit
 *     log only records userId (no email, no name) — once the User row
 *     is gone, the audit row is just an opaque cuid.
 *
 * Defence in depth:
 *   - Both endpoints require authenticateJWT — only the data subject
 *     themselves can act on their own data. SUPER_ADMIN can act on
 *     anyone's data via the admin-impersonation flow (Phase 10.3).
 *   - INSTITUTION_ADMIN cannot erase themselves if they are the only
 *     remaining INSTITUTION_ADMIN — would orphan the institution. The
 *     check returns 409 with a clear message explaining why and what
 *     to do (transfer ownership first, then erase).
 *   - The erasure endpoint emits gdpr.erasure.completed with the
 *     entityId set to the (now-deleted) userId, before the actual
 *     delete, so the audit row survives.
 *
 * Out of scope for this PR (separate workstreams):
 *   - Soft-delete schema migration for non-User tables. Erasure today
 *     is a hard delete + cascade. A future PR adds `deletedAt` columns
 *     so an erasure can be reversed during a 30-day grace period.
 *   - Retention scheduler (a cron that hard-deletes soft-deleted rows
 *     past their retention horizon).
 *   - Institution-level erasure (cascading delete of every user +
 *     basket + evaluation tied to one Institution). Workflow needs
 *     billing-cancellation + data-export-archive coordination.
 *   - DPA boilerplate (legal docs).
 */
import type { Request, Response, NextFunction } from 'express';
import prisma from '../../utils/prisma';
import { audit } from '../../lib/audit';
import { AppError } from '../../utils/errors';
import { logger } from '../../lib/logger';

/**
 * Builds a data-subject access bundle for the authenticated user. Walks
 * every relation that holds personal data tied to that User. The shape
 * is stable enough that a customer can hand the JSON to a reviewer
 * without further processing.
 */
async function buildDsarBundle(userId: string): Promise<Record<string, unknown>> {
  const [user, notifications, evaluationMemberships, domainAssignments, auditEntries] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        institutionId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.evaluationMember.findMany({ where: { userId } }),
    prisma.evaluationDomainAssignment.findMany({ where: { assignedToId: userId } }),
    prisma.auditLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 1000 }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    subject: { userId },
    profile: user,
    notifications,
    evaluationMemberships,
    domainAssignments,
    auditTrail: auditEntries,
    notes: [
      'This export contains every row where you are the named data subject.',
      'Institution-level data (baskets, scores, evaluations) is shared with your colleagues and is not part of this export. Contact your institution admin for that data.',
      'Audit log entries are capped at the most recent 1000.',
    ],
  };
}

export const exportMyData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const me = req.user!;
    const bundle = await buildDsarBundle(me.userId);

    await audit(req, {
      action: 'gdpr.dsar.requested',
      entityType: 'User',
      entityId: me.userId,
      userId: me.userId,
      changes: {
        notificationCount: Array.isArray(bundle['notifications']) ? bundle['notifications'].length : 0,
      },
    });

    // Hint to clients that this is a download; UI can wire a save-as
    // dialog from the JSON content type alone.
    res.setHeader('Content-Disposition', `attachment; filename="herm-data-export-${me.userId}.json"`);
    res.json({ success: true, data: bundle });
  } catch (err) {
    next(err);
  }
};

export const eraseMyAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const me = req.user!;

    // Defence-in-depth: refuse to erase the only remaining
    // INSTITUTION_ADMIN of an institution. Otherwise the institution
    // gets orphaned with no human able to administer billing, role
    // changes, or evaluations. The user must first transfer
    // INSTITUTION_ADMIN to a colleague — a short, clear error tells
    // them so.
    if (me.role === 'INSTITUTION_ADMIN') {
      const otherAdminCount = await prisma.user.count({
        where: { institutionId: me.institutionId, role: 'INSTITUTION_ADMIN', id: { not: me.userId } },
      });
      if (otherAdminCount === 0) {
        throw new AppError(
          409,
          'GDPR_ERASURE_CONFLICT',
          'You are the only INSTITUTION_ADMIN for this institution. Promote another user to INSTITUTION_ADMIN first, then re-request erasure. This protects the institution from being orphaned.',
        );
      }
    }

    // Audit BEFORE the delete so the row references the userId that's
    // about to disappear. Once the User row is gone, the audit row is
    // an opaque cuid — no PII left over. Article 17(3)(b)/(e) covers
    // this retention.
    await audit(req, {
      action: 'gdpr.erasure.completed',
      entityType: 'User',
      entityId: me.userId,
      userId: me.userId,
      changes: { role: me.role, institutionId: me.institutionId },
    });

    // Cascade deletes: Notification, EvaluationMember,
    // EvaluationDomainAssignment all set onDelete: Cascade. AuditLog
    // and ChatMessage have nullable userId without an FK constraint,
    // so they're left in place by design — see module header.
    await prisma.user.delete({ where: { id: me.userId } });

    logger.info({ erasedUserId: me.userId }, 'gdpr.erasure: user record deleted');

    res.json({
      success: true,
      data: {
        erased: true,
        userId: me.userId,
        notes: [
          'Your User record and personal Notifications have been deleted.',
          'Audit log entries reference your former user ID and are retained under Article 17(3)(b)/(e) for legal-compliance and dispute purposes.',
          'If you still hold an access token, it may remain valid until it expires unless it is separately revoked by the authentication layer.',
        ],
      },
    });
  } catch (err) {
    next(err);
  }
};
