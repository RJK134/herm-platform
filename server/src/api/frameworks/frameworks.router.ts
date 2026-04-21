import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../utils/prisma';
import { optionalJWT } from '../../middleware/auth';
import { NotFoundError } from '../../utils/errors';

const router = Router();

/**
 * GET /api/frameworks
 * Lists all active frameworks.
 * Free tier / anonymous: only frameworks where isPublic=true.
 * Paid tier: all active frameworks.
 */
router.get('/', optionalJWT, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tier = req.user?.tier ?? 'free';
    const isPaid = ['professional', 'enterprise', 'admin'].includes(tier);

    const frameworks = await prisma.framework.findMany({
      where: {
        isActive: true,
        ...(isPaid ? {} : { isPublic: true }),
      },
      select: {
        id: true,
        slug: true,
        name: true,
        version: true,
        publisher: true,
        description: true,
        licenceType: true,
        // licenceNotice + licenceUrl are read by the LicenceAttribution
        // client component to render accurate attribution per framework.
        licenceNotice: true,
        licenceUrl: true,
        isPublic: true,
        isDefault: true,
        domainCount: true,
        capabilityCount: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: frameworks });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/frameworks/:id
 * Returns a single framework by id, with domain counts.
 */
router.get('/:id', optionalJWT, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const framework = await prisma.framework.findUnique({
      where: { id: req.params['id'] as string },
      include: {
        domains: {
          select: {
            id: true,
            code: true,
            name: true,
            category: true,
            description: true,
            sortOrder: true,
            colour: true,
            capabilityCount: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!framework || !framework.isActive) {
      throw new NotFoundError(`Framework not found: ${req.params['id']}`);
    }

    // Free tier / anonymous cannot access non-public frameworks
    const tier = req.user?.tier ?? 'free';
    const isPaid = ['professional', 'enterprise', 'admin'].includes(tier);
    if (!framework.isPublic && !isPaid) {
      res.status(403).json({
        success: false,
        error: {
          code: 'AUTHORIZATION_ERROR',
          message: 'Upgrade to Professional or Enterprise to access this framework',
        },
      });
      return;
    }

    res.json({ success: true, data: framework });
  } catch (err) {
    next(err);
  }
});

export default router;
