import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { authenticateJWT } from '../../middleware/auth';
import { requirePaidTier } from '../../middleware/require-paid-tier';
import prisma from '../../utils/prisma';

const router = Router();

// API access is an Enterprise-tier feature per the published pricing table.
// We require a real JWT and gate on tier — previously the routes accepted
// an anonymous institutionId='anonymous' fallback which both leaked data
// across anonymous callers and bypassed commercial gating.
router.use(authenticateJWT, requirePaidTier(['enterprise']));

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.enum(['read:systems', 'read:capabilities', 'read:scores', 'read:baskets'])).min(1),
  expiresAt: z.string().optional(),
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createKeySchema.parse(req.body);
    const institutionId = req.user!.institutionId;
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
    const institutionId = req.user!.institutionId;
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
    const institutionId = req.user!.institutionId;
    // Scope revocation to the caller's institution — otherwise any
    // enterprise user could revoke a key belonging to another tenant.
    const result = await prisma.apiKey.updateMany({
      where: { id: req.params['id'], institutionId },
      data: { isActive: false },
    });
    if (result.count === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'API key not found', requestId: req.id },
      });
      return;
    }
    res.json({ success: true, data: { revoked: true } });
  } catch (err) { next(err); }
});

export default router;
