/**
 * TOTP-based MFA management endpoints (Phase 10.8).
 *
 * Three endpoints, all authenticated:
 *   - POST /api/auth/mfa/enroll  — mint a fresh secret + otpauth URI for
 *     the caller. Stores the secret on the User row but leaves
 *     `mfaEnabledAt` null until the verify step succeeds. Refuses if MFA
 *     is already active (the caller must `disable` first).
 *   - POST /api/auth/mfa/verify  — exchange a 6-digit code for activation.
 *     On success, stamps `mfaEnabledAt` and the next login will gate on
 *     a TOTP challenge.
 *   - POST /api/auth/mfa/disable — clear the secret + activation. Requires
 *     a valid TOTP code so an attacker who has stolen a session token
 *     cannot turn MFA off without also having the user's authenticator.
 *
 * The companion login-flow endpoint `POST /api/auth/mfa/login` lives in
 * `auth.controller.ts` because it is the second leg of the login flow,
 * not an account-management endpoint.
 *
 * Audit:
 *   - auth.mfa.enroll        — fresh secret minted (not yet active)
 *   - auth.mfa.verify        — secret activated; MFA now enforced
 *   - auth.mfa.verify.fail   — wrong code on activation
 *   - auth.mfa.disable       — MFA turned off
 *   - auth.mfa.disable.fail  — wrong code on disable attempt
 */
import type { Request, Response, NextFunction } from 'express';
import prisma from '../../utils/prisma';
import { mfaCodeSchema } from './auth.schema';
import { audit } from '../../lib/audit';
import { AppError } from '../../utils/errors';
import { buildOtpauthUri, generateMfaSecret, verifyTotp } from '../../lib/mfa';

export const enrollMfa = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, mfaEnabledAt: true },
    });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

    if (user.mfaEnabledAt) {
      throw new AppError(
        409,
        'MFA_ALREADY_ENABLED',
        'MFA is already active. Disable it first to enrol a new secret.',
      );
    }

    const secret = generateMfaSecret();
    const otpauthUri = buildOtpauthUri(secret, user.email);

    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    });

    await audit(req, {
      action: 'auth.mfa.enroll',
      entityType: 'User',
      entityId: userId,
      userId,
    });

    res.json({
      success: true,
      data: {
        secret,
        otpauthUri,
        // The client renders these to the user. The secret is shown for
        // manual entry into authenticator apps that don't accept QR; the
        // otpauth URI can be encoded as a QR client-side. We deliberately
        // do NOT cache the secret outside the DB row; if the client loses
        // it before verification, calling `enroll` again rotates it.
      },
    });
  } catch (err) {
    next(err);
  }
};

export const verifyMfa = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { code } = mfaCodeSchema.parse(req.body);
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, mfaSecret: true, mfaEnabledAt: true },
    });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

    if (!user.mfaSecret) {
      throw new AppError(
        400,
        'MFA_NOT_ENROLLED',
        'No MFA secret on this account. Call enrol first.',
      );
    }
    if (user.mfaEnabledAt) {
      throw new AppError(
        409,
        'MFA_ALREADY_ENABLED',
        'MFA is already active for this account.',
      );
    }

    if (!verifyTotp(user.mfaSecret, code)) {
      await audit(req, {
        action: 'auth.mfa.verify.fail',
        entityType: 'User',
        entityId: userId,
        userId,
      });
      throw new AppError(401, 'AUTHENTICATION_ERROR', 'Invalid authentication code');
    }

    const enabledAt = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabledAt: enabledAt },
    });

    await audit(req, {
      action: 'auth.mfa.verify',
      entityType: 'User',
      entityId: userId,
      userId,
      changes: { enabledAt: enabledAt.toISOString() },
    });

    res.json({
      success: true,
      data: { enabledAt: enabledAt.toISOString() },
    });
  } catch (err) {
    next(err);
  }
};

export const disableMfa = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { code } = mfaCodeSchema.parse(req.body);
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, mfaSecret: true, mfaEnabledAt: true },
    });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

    if (!user.mfaEnabledAt || !user.mfaSecret) {
      throw new AppError(
        400,
        'MFA_NOT_ENABLED',
        'MFA is not currently active for this account.',
      );
    }

    if (!verifyTotp(user.mfaSecret, code)) {
      await audit(req, {
        action: 'auth.mfa.disable.fail',
        entityType: 'User',
        entityId: userId,
        userId,
      });
      throw new AppError(401, 'AUTHENTICATION_ERROR', 'Invalid authentication code');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: null, mfaEnabledAt: null },
    });

    await audit(req, {
      action: 'auth.mfa.disable',
      entityType: 'User',
      entityId: userId,
      userId,
    });

    res.json({ success: true, data: { disabled: true } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/mfa/status — read-only view of the caller's enrolment
 * state. Used by the Security settings page to render the right CTA
 * (enrol vs disable). Does NOT return the secret — once enrolled, the
 * secret only exists for verification, never for display.
 */
export const mfaStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true, mfaEnabledAt: true },
    });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

    res.json({
      success: true,
      data: {
        enrolled: user.mfaSecret !== null,
        enabled: user.mfaEnabledAt !== null,
        enabledAt: user.mfaEnabledAt ? user.mfaEnabledAt.toISOString() : null,
      },
    });
  } catch (err) {
    next(err);
  }
};
