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
 * If ?frameworkId is provided, looks it up directly.
 * If not provided, finds the default framework (isDefault: true).
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
          where: { isDefault: true, isActive: true },
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
