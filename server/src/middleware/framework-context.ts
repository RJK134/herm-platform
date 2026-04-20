import { Request, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      frameworkId?: string;
      framework?: {
        id: string;
        slug: string;
        name: string;
        isPublic: boolean;
        isDefault: boolean;
        licenceType: string;
        publisher: string;
        licenceUrl: string | null;
        licenceNotice: string | null;
      };
    }
  }
}

/**
 * Resolves frameworkId from query string and attaches framework metadata to req.
 *
 * Resolution order:
 *   1. Explicit `?frameworkId=…` — honoured as given (tier-gate middleware is
 *      expected to run before this for paid-only frameworks).
 *   2. Fallback — first **public** active framework (HERM under CC-BY-NC-SA).
 *
 * The previous fallback used `isDefault: true`, which on the current seed
 * points at the proprietary FHE framework. Anonymous / free-tier callers
 * would silently receive proprietary data. Defaulting to the public framework
 * is safe for every tier; paid callers that want a non-public default
 * pass the frameworkId explicitly (via tier-gate / subscription logic).
 */
export async function frameworkContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const frameworkId = req.query['frameworkId'] as string | undefined;

    const framework = frameworkId
      ? await prisma.framework.findUnique({
          where: { id: frameworkId },
          select: {
            id: true,
            slug: true,
            name: true,
            isPublic: true,
            isDefault: true,
            isActive: true,
            licenceType: true,
            publisher: true,
            licenceUrl: true,
            licenceNotice: true,
          },
        })
      : await prisma.framework.findFirst({
          where: { isPublic: true, isActive: true },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            slug: true,
            name: true,
            isPublic: true,
            isDefault: true,
            isActive: true,
            licenceType: true,
            publisher: true,
            licenceUrl: true,
            licenceNotice: true,
          },
        });

    if (!framework) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: frameworkId
            ? `Framework not found: ${frameworkId}`
            : 'No default framework configured',
        },
      });
      return;
    }

    if (!framework.isActive) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Framework is not active' },
      });
      return;
    }

    req.frameworkId = framework.id;
    req.framework = framework;
    next();
  } catch (err) {
    next(err);
  }
}
