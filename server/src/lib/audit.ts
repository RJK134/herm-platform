/**
 * Audit-log helper.
 *
 * Phase 9 / Workstream H. Centralises the `prisma.auditLog.create` call
 * shape so contributors don't have to remember every column. Best-effort:
 * an audit-write failure is logged but never propagates, because the
 * action being audited has already happened — losing the audit row is
 * regrettable, losing the action because the audit row failed would be
 * worse.
 *
 * Usage:
 *
 *   await audit(req, {
 *     action: 'auth.login.success',
 *     entityType: 'User',
 *     entityId: user.id,
 *     userId: user.id,
 *     changes: { email: user.email },
 *   });
 *
 * The action namespace convention is `<surface>.<event>.<outcome?>`:
 *   - auth.login.success / auth.login.fail / auth.logout / auth.password.change
 *   - admin.vendor.update / admin.submission.review
 *   - keys.create / keys.revoke
 *   - export.csv / export.json
 *   - billing.tier.change / billing.dunning.past_due / billing.dispute.opened
 *   - institutions.role.change
 */
import type { Request } from 'express';
import prisma from '../utils/prisma';
import { logger } from './logger';

export interface AuditEntry {
  /** Dotted action namespace, e.g. `auth.login.success`. */
  action: string;
  /** Prisma model name the action targeted, e.g. `User`, `Subscription`. */
  entityType: string;
  /** PK of the targeted row, when one exists. */
  entityId?: string | null;
  /** Authenticated user that performed the action, when one is known. */
  userId?: string | null;
  /** Optional structured payload describing the change. */
  changes?: Record<string, unknown>;
}

function ipFromReq(req: Request | undefined): string | null {
  if (!req) return null;
  // Express's `req.ip` already respects the trust-proxy setting if configured.
  return req.ip ?? null;
}

/**
 * Write a single AuditLog row. Resolves regardless of write success — a
 * Prisma failure is logged but never thrown to the caller. If you NEED
 * audit-failure to abort the action, write the row inside the same
 * transaction as the action (see procurement / evaluations services for
 * the transactional pattern).
 */
export async function audit(req: Request | undefined, entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        changes: (entry.changes ?? null) as never,
        ipAddress: ipFromReq(req),
      },
    });
  } catch (err) {
    logger.warn(
      {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        err: err instanceof Error ? err.message : String(err),
      },
      'audit write failed — action proceeded, log row lost',
    );
  }
}
