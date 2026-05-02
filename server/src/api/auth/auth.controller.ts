import type { Request, Response, NextFunction } from 'express';
import prisma from '../../utils/prisma';
import { AuthService, resolveEffectiveTier } from './auth.service';
import { AccountLockedError } from '../../lib/lockout';
import { registerSchema, loginSchema, updateProfileSchema, mfaLoginSchema } from './auth.schema';
import { audit } from '../../lib/audit';
import { AppError } from '../../utils/errors';
import { generateToken, type JwtPayload } from '../../middleware/auth';
import { verifyMfaChallengeToken, verifyTotp } from '../../lib/mfa';
import { revokeSession } from '../../lib/session-store';
import { recordAuthLogin } from '../../lib/metrics';

const service = new AuthService();

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await service.register(data);
    await audit(req, {
      action: 'auth.register',
      entityType: 'User',
      entityId: result.user.userId,
      userId: result.user.userId,
      changes: { email: result.user.email, institutionId: result.user.institutionId },
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = loginSchema.parse(req.body);
    try {
      const result = await service.login(data);
      // Phase 10.8: a successful PASSWORD step does not yet imply a
      // session. When the account has MFA active, `login` returns a
      // challenge envelope; the actual session is minted by
      // `mfaLogin` after the TOTP step succeeds.
      if ('requiresMfa' in result) {
        await audit(req, {
          action: 'auth.login.mfa_required',
          entityType: 'User',
          changes: { email: data.email.toLowerCase() },
        });
        res.json({ success: true, data: result });
        return;
      }
      await audit(req, {
        action: 'auth.login.success',
        entityType: 'User',
        entityId: result.user.userId,
        userId: result.user.userId,
      });
      res.json({ success: true, data: result });
    } catch (loginErr) {
      // Failed-login attempts must be logged so a security review can
      // reconstruct credential-stuffing or account-targeting attacks. We
      // intentionally don't log the password — only the email tried.
      if (loginErr instanceof AccountLockedError) {
        await audit(req, {
          action: 'auth.login.fail',
          entityType: 'User',
          changes: {
            emailTried: data.email.toLowerCase(),
            locked: true,
            retryAfterSeconds: loginErr.retryAfterSeconds,
          },
        });
        // On the boundary attempt that first engaged the lockout, emit a
        // dedicated audit event so a security review can distinguish the
        // lockout trigger from subsequent attempts against an already-locked
        // account. `newlyEngaged` is only true on the attempt that crossed
        // the threshold — not on every subsequent locked request.
        if (loginErr.newlyEngaged) {
          await audit(req, {
            action: 'auth.lockout.engaged',
            entityType: 'User',
            changes: {
              emailTried: data.email.toLowerCase(),
              retryAfterSeconds: loginErr.retryAfterSeconds,
            },
          });
        }
        // RFC-7231 Retry-After header so clients (and humans reading
        // network panels) know when to try again without parsing the body.
        res.setHeader('Retry-After', String(loginErr.retryAfterSeconds));
      } else if (loginErr instanceof AppError && loginErr.statusCode === 401) {
        await audit(req, {
          action: 'auth.login.fail',
          entityType: 'User',
          changes: { emailTried: data.email.toLowerCase() },
        });
      }
      throw loginErr;
    }
  } catch (err) {
    next(err);
  }
};

export const me = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await service.getMe(req.user!.userId);
    // Phase 10.3: surface the impersonator claim so the client can render
    // the "You are viewing the platform as <customer>" banner. The claim
    // already lives on the JWT — getMe doesn't reload it from the DB.
    const impersonator = req.user?.impersonator;
    res.json({
      success: true,
      data: impersonator ? { ...user, impersonator } : user,
    });
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name } = updateProfileSchema.parse(req.body);
    if (!name) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'name is required' },
      });
      return;
    }
    const user = await service.updateProfile(req.user!.userId, name);
    await audit(req, {
      action: 'auth.profile.update',
      entityType: 'User',
      entityId: req.user!.userId,
      userId: req.user!.userId,
      changes: { name },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  // Token invalidation is client-side only, but we record the event so a
  // security review can correlate session ends with subsequent activity.
  // The route requires authenticateJWT, so req.user is guaranteed —
  // anonymous / expired-token logout returns 401 from the middleware,
  // which the client's axios interceptor maps to the same "clear token
  // and redirect to /login" UX as a successful logout.
  try {
    // Phase 11.12 — also revoke the session-store row so a stolen JWT
    // cannot be reused for the rest of its 7-day lifetime. Tokens
    // minted before that phase have no jti claim; the call is a no-op
    // for them. Best-effort: a session-store hiccup does not block the
    // 200 because audit + client-side wipe still complete.
    if (req.user!.jti) {
      await revokeSession(req.user!.jti);
    }
    await audit(req, {
      action: 'auth.logout',
      entityType: 'User',
      entityId: req.user!.userId,
      userId: req.user!.userId,
    });
    res.json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/mfa/login — second leg of the login flow. The caller
 * presents the short-lived challenge token from the password step plus a
 * 6-digit TOTP code; on success this mints a normal session JWT.
 *
 * The challenge token is purpose-tagged ('mfa_challenge') and rejected by
 * `authenticateJWT` for normal session use, so this endpoint is the only
 * place a challenge can be consumed.
 */
export const mfaLogin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { challengeToken, code } = mfaLoginSchema.parse(req.body);

    const userId = verifyMfaChallengeToken(challengeToken);
    if (!userId) {
      throw new AppError(401, 'AUTHENTICATION_ERROR', 'Challenge expired — sign in again');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { institution: { include: { subscription: true } } },
    });
    if (!user) {
      throw new AppError(401, 'AUTHENTICATION_ERROR', 'Account no longer exists');
    }

    // Defence in depth: the user might have disabled MFA between password
    // and TOTP steps. If so, refuse the challenge — the password step's
    // result is no longer well-defined, and the client should retry login
    // from scratch (which will succeed without a TOTP step).
    if (!user.mfaEnabledAt || !user.mfaSecret) {
      throw new AppError(409, 'MFA_NOT_ENABLED', 'MFA is no longer enabled — sign in again');
    }

    if (!verifyTotp(user.mfaSecret, code)) {
      await audit(req, {
        action: 'auth.login.mfa.fail',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
      });
      recordAuthLogin('mfa_failed');
      throw new AppError(401, 'AUTHENTICATION_ERROR', 'Invalid authentication code');
    }

    const tier = resolveEffectiveTier(
      user.institution.subscription?.tier?.toLowerCase() ?? 'free',
    );
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      institutionId: user.institutionId,
      institutionName: user.institution.name,
      tier,
    };

    await audit(req, {
      action: 'auth.login.mfa.success',
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
    });
    // Phase 12.2 — record the login as success on the MFA branch too.
    // The password-only branch records `success` inside `auth.service`;
    // the MFA branch finalises here, so the counter increment lives
    // alongside the audit row that marks the same outcome.
    recordAuthLogin('success');

    res.json({
      success: true,
      data: { token: generateToken(payload), user: payload },
    });
  } catch (err) {
    next(err);
  }
};
