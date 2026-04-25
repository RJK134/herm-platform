import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth';
import prisma from '../../utils/prisma';

const router = Router();
// Notifications are user-scoped — every endpoint reads or mutates rows
// keyed off req.user.userId. Per HERM_COMPLIANCE.md "Authenticated
// (any tier)" the prefix requires a real JWT. The previous `optionalJWT`
// allowed an anonymous PATCH /:id/read to flip any notification's
// is-read flag, because the where-clause did not scope by userId.
router.use(authenticateJWT);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const page = Math.max(1, parseInt(req.query['page'] as string ?? '1'));
    const limit = 20;
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
    ]);
    res.json({ success: true, data: notifications, meta: { total, page, limit } });
  } catch (err) { next(err); }
});

router.get('/count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const count = await prisma.notification.count({ where: { userId, isRead: false } });
    res.json({ success: true, data: { count } });
  } catch (err) { next(err); }
});

router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    // Scope the mutation to the caller's notifications. updateMany is used
    // (not update) so a wrong-owner id is a no-op rather than a thrown
    // P2025; a count of 0 maps to a clean 404 envelope.
    const result = await prisma.notification.updateMany({
      where: { id: req.params['id'], userId },
      data: { isRead: true },
    });
    if (result.count === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Notification not found', requestId: req.id },
      });
      return;
    }
    res.json({ success: true, data: { read: true } });
  } catch (err) { next(err); }
});

router.post('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    res.json({ success: true, data: { message: 'All notifications marked as read.' } });
  } catch (err) { next(err); }
});

export default router;
