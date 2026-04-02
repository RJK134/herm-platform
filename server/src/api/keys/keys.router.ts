import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { optionalJWT } from '../../middleware/auth';
import prisma from '../../utils/prisma';

const router = Router();
router.use(optionalJWT);

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.enum(['read:systems', 'read:capabilities', 'read:scores', 'read:baskets'])).min(1),
  expiresAt: z.string().optional(),
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createKeySchema.parse(req.body);
    const institutionId = req.user?.institutionId ?? 'anonymous';
    const rawKey = `herm_pk_${crypto.randomBytes(32).toString('hex')}`;
    const keyPrefix = rawKey.substring(0, 16);
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await prisma.apiKey.create({
      data: {
        institutionId,
        name: data.name,
        keyHash,
        keyPrefix,
        permissions: data.permissions,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        isActive: true,
      },
    });
    res.status(201).json({
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        permissions: apiKey.permissions,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        key: rawKey,
        warning: 'Store this key securely. It will not be shown again.',
      },
    });
  } catch (err) { next(err); }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const institutionId = req.user?.institutionId ?? 'anonymous';
    const keys = await prisma.apiKey.findMany({
      where: { institutionId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: keys });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.apiKey.update({ where: { id: req.params['id'] }, data: { isActive: false } });
    res.json({ success: true, data: { revoked: true } });
  } catch (err) { next(err); }
});

export default router;
