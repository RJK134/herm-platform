/**
 * Customer-support impersonation (Phase 10.3).
 *
 * Threat model:
 *   - SUPER_ADMIN engineers occasionally need to reproduce a bug as a
 *     specific customer user — typing the URL while logged in as
 *     themselves doesn't surface the customer's tier, institution
 *     scoping, or workspace contents.
 *   - We don't want to share the customer's password (or maintain a
 *     parallel "support" login per institution).
 *   - Every action taken while impersonating MUST be attributable to
 *     the SUPER_ADMIN — both for governance audits and so the
 *     customer's own audit timeline doesn't show ghost activity.
 *
 * Design:
 *   - POST /api/admin/impersonate { userId } → 1-hour JWT for the target.
 *     The JWT carries an `impersonator` claim with the SUPER_ADMIN's
 *     identity. Every middleware that reads `req.user.role/.tier/.institutionId`
 *     keeps working unchanged (the support engineer sees what the
 *     customer sees).
 *   - POST /api/admin/impersonate/end → fresh 7-day JWT for the original
 *     SUPER_ADMIN. Rejects 400 if the bearer isn't currently impersonating.
 *   - Both ends are AuditLog'd with action='admin.impersonate.start|end'.
 *   - audit() in lib/audit.ts merges `impersonator` into `changes` for
 *     every other log row written during the impersonation, so a single
 *     query for the SUPER_ADMIN's userId surfaces the entire support
 *     session.
 *
 * Defence in depth:
 *   - Cannot impersonate self.
 *   - Cannot impersonate another SUPER_ADMIN — limits blast radius if a
 *     SUPER_ADMIN account is compromised.
 *   - Cannot chain impersonation (the start endpoint rejects when
 *     `req.user.impersonator` is already set).
 */
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../../utils/prisma';
import { generateImpersonationToken, generateToken, type JwtPayload } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { AppError } from '../../utils/errors';
import { resolveEffectiveTier } from '../auth/auth.service';

const startSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
});

export const startImpersonation = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const actor = req.user!;
    if (actor.role !== 'SUPER_ADMIN') {
      throw new AppError(403, 'AUTHORIZATION_ERROR', 'Only SUPER_ADMIN can impersonate users');
    }
    if (actor.impersonator) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Already impersonating — end the current session before starting a new one');
    }
    const { userId } = startSchema.parse(req.body);
    if (userId === actor.userId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Cannot impersonate yourself');
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      include: { institution: { include: { subscription: true } } },
    });
    if (!target) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }
    if (target.role === 'SUPER_ADMIN') {
      throw new AppError(403, 'AUTHORIZATION_ERROR', 'Cannot impersonate another SUPER_ADMIN');
    }

    const targetPayload: Omit<JwtPayload, 'impersonator'> = {
      userId: target.id,
      email: target.email,
      name: target.name,
      role: target.role,
      institutionId: target.institutionId,
      institutionName: target.institution.name,
      tier: resolveEffectiveTier(target.institution.subscription?.tier?.toLowerCase() ?? 'free'),
    };
    const token = generateImpersonationToken(targetPayload, {
      userId: actor.userId,
      email: actor.email,
      name: actor.name,
    });

    await audit(req, {
      action: 'admin.impersonate.start',
      entityType: 'User',
      entityId: target.id,
      userId: actor.userId,
      changes: {
        targetUserId: target.id,
        targetEmail: target.email,
        targetRole: target.role,
        targetInstitutionId: target.institutionId,
      },
    });

    res.json({
      success: true,
      data: {
        token,
        expiresInSeconds: 3600,
        impersonating: { userId: target.id, email: target.email, name: target.name },
      },
    });
  } catch (err) {
    next(err);
  }
};

export const endImpersonation = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const actor = req.user!;
    if (!actor.impersonator) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Not currently impersonating — nothing to end');
    }
    const original = await prisma.user.findUnique({
      where: { id: actor.impersonator.userId },
      include: { institution: { include: { subscription: true } } },
    });
    if (!original) {
      // The original SUPER_ADMIN was deleted during the session — possible
      // if account cleanup ran in another window. Refuse rather than mint
      // a token referencing a non-existent user.
      throw new AppError(404, 'NOT_FOUND', 'Original user no longer exists');
    }

    const restoredPayload: JwtPayload = {
      userId: original.id,
      email: original.email,
      name: original.name,
      role: original.role,
      institutionId: original.institutionId,
      institutionName: original.institution.name,
      tier: resolveEffectiveTier(original.institution.subscription?.tier?.toLowerCase() ?? 'free'),
    };
    const token = generateToken(restoredPayload);

    await audit(req, {
      action: 'admin.impersonate.end',
      entityType: 'User',
      entityId: actor.userId,
      userId: actor.impersonator.userId,
      changes: {
        endedTargetUserId: actor.userId,
        endedTargetEmail: actor.email,
      },
    });

    res.json({
      success: true,
      data: { token, user: restoredPayload },
    });
  } catch (err) {
    next(err);
  }
};
