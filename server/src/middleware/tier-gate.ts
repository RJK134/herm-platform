import { Request, Response, NextFunction } from 'express';
import { isPaidTier } from '../lib/branding';

/**
 * Checks if the user's subscription tier allows access to the requested framework.
 * - Free tier (or anonymous): only frameworks with isPublic=true
 * - Professional/Enterprise: all active frameworks
 *
 * Must run AFTER optionalJWT (so req.user is populated if token exists)
 * and AFTER frameworkContext (so req.framework is populated).
 */
export function tierGate(req: Request, res: Response, next: NextFunction): void {
  const framework = req.framework;

  if (!framework) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'tierGate must run after frameworkContext middleware',
      },
    });
    return;
  }

  // If the framework is public, anyone can access it
  if (framework.isPublic) {
    next();
    return;
  }

  // Determine the user's tier — anonymous users are treated as free tier
  if (isPaidTier(req.user?.tier)) {
    next();
    return;
  }

  // Free tier trying to access a non-public framework
  res.status(403).json({
    success: false,
    error: {
      code: 'AUTHORIZATION_ERROR',
      message: 'Upgrade to Professional or Enterprise to access this framework',
    },
  });
}
