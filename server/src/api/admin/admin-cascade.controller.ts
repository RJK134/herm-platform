/**
 * SUPER_ADMIN-only endpoints for soft-delete cascade + restore
 * (Phase 11.14).
 *
 *   DELETE /api/admin/institutions/:id              — cascade-soft-delete
 *   POST   /api/admin/institutions/:id/restore      — reverse a recent cascade
 *   POST   /api/admin/users/:id/restore             — reverse a single-user soft-delete
 *
 * The cascade endpoint stamps `deletedAt` on the Institution + its
 * Subscription + every User (PII-scrubbed), and hard-deletes the
 * SsoIdentityProvider rows. The retention scheduler from Phase 11.9
 * hard-deletes Users past the grace window; future scheduler work can
 * extend the same grace to Institution + Subscription rows.
 *
 * The restore endpoints reverse `deletedAt` within the grace window.
 * PII scrubbed by the cascade is NOT recoverable — the operator must
 * re-enter user emails / names manually for any account they want to
 * keep. This is a documented limitation in the customer onboarding doc.
 */
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../utils/errors';
import {
  softDeleteInstitution,
  restoreInstitution,
  restoreUser,
} from '../../services/retention/cascade';

function requireSuperAdmin(req: Request): void {
  if (req.user?.role !== 'SUPER_ADMIN') {
    throw new AppError(
      403,
      'AUTHORIZATION_ERROR',
      'Soft-delete cascade is restricted to SUPER_ADMIN.',
    );
  }
}

export const cascadeSoftDeleteInstitution = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    requireSuperAdmin(req);
    const institutionId = req.params['id'];
    if (!institutionId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Institution id is required.');
    }
    const stats = await softDeleteInstitution(req, institutionId);
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
};

export const cascadeRestoreInstitution = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    requireSuperAdmin(req);
    const institutionId = req.params['id'];
    if (!institutionId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Institution id is required.');
    }
    await restoreInstitution(req, institutionId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

const restoreUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
});

export const cascadeRestoreUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    requireSuperAdmin(req);
    const userId = req.params['id'];
    if (!userId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'User id is required.');
    }
    const parsed = restoreUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.errors[0]?.message ?? 'Invalid payload',
      );
    }
    await restoreUser(req, userId, parsed.data.email, parsed.data.name);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
