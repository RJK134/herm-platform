import { Router, Request, Response, NextFunction } from 'express';
import { optionalJWT } from '../../middleware/auth';
import prisma from '../../utils/prisma';

const router = Router();
router.use(optionalJWT);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.json({ success: true, data: [], meta: { total: 0 } }); return; }
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
    const userId = req.user?.userId;
    const count = userId ? await prisma.notification.count({ where: { userId, isRead: false } }) : 0;
    res.json({ success: true, data: { count } });
  } catch (err) { next(err); }
});

router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.notification.update({ where: { id: req.params['id'] }, data: { isRead: true } });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.post('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (userId) await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    res.json({ success: true, data: { message: 'All notifications marked as read.' } });
  } catch (err) { next(err); }
});

export default router;
