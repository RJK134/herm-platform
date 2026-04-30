import type { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { AccountLockedError } from '../../lib/lockout';
import { registerSchema, loginSchema, updateProfileSchema } from './auth.schema';
import { audit } from '../../lib/audit';
import { AppError } from '../../utils/errors';

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
        // Do not emit `auth.lockout.engaged` here because this controller
        // cannot distinguish a newly engaged lockout from an attempt made
        // while the account is already locked. Record it as a failed login
        // with lockout context instead, so audit trails remain accurate
        // without inflating lockout-engaged counts.
        await audit(req, {
          action: 'auth.login.fail',
          entityType: 'User',
          changes: {
            emailTried: data.email.toLowerCase(),
            locked: true,
            retryAfterSeconds: loginErr.retryAfterSeconds,
          },
        });
        // RFC-7231 Retry-After header so clients (and humans reading
        // network panels) know when to try again without parsing the
        // body.
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
    res.json({ success: true, data: user });
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
