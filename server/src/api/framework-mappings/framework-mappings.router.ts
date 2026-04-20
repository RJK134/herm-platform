import { Router, Request, Response, NextFunction } from 'express';
import { optionalJWT } from '../../middleware/auth';
import { FrameworkMappingsService } from './framework-mappings.service';
import { ForbiddenError } from '../../utils/errors';

const router = Router();
const service = new FrameworkMappingsService();

/**
 * Enterprise-tier gate.
 *
 * Framework mappings are an Enterprise-only capability (cross-framework
 * migration tooling). Access is granted when:
 *   - the user is authenticated AND their JWT tier is 'enterprise', OR
 *   - the user is a SUPER_ADMIN (platform-wide override).
 *
 * Anonymous, free-tier, and professional-tier users receive a 403.
 */
function requireEnterprise(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    return next(new ForbiddenError('Authentication required for framework mappings'));
  }
  const tier = (user.tier ?? '').toLowerCase();
  if (tier !== 'enterprise' && user.role !== 'SUPER_ADMIN') {
    return next(new ForbiddenError('Framework mappings require an Enterprise subscription'));
  }
  next();
}

/**
 * GET /api/framework-mappings
 * List all active framework mappings (Enterprise only).
 */
router.get('/', optionalJWT, requireEnterprise, async (_req, res, next) => {
  try {
    const mappings = await service.list();
    res.json({ success: true, data: mappings });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/framework-mappings/:id
 * Return a single framework mapping with all its capability items.
 */
router.get('/:id', optionalJWT, requireEnterprise, async (req, res, next) => {
  try {
    const mapping = await service.getById(req.params['id']!);
    res.json({ success: true, data: mapping });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/framework-mappings/:id/lookup?sourceCode=BC008
 * Resolve source-capability code to target capabilities with strength
 * metadata. Returns an empty targets array if the source code exists but
 * has no mappings; 400 if sourceCode is missing.
 */
router.get('/:id/lookup', optionalJWT, requireEnterprise, async (req, res, next) => {
  try {
    const sourceCode = String(req.query['sourceCode'] ?? '');
    if (!sourceCode) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Missing sourceCode query param' },
      });
      return;
    }
    const result = await service.lookup(req.params['id']!, sourceCode);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
