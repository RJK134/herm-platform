import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth';
import { requirePaidTier } from '../../middleware/require-paid-tier';
import { FrameworkMappingsService } from './framework-mappings.service';

const router = Router();
const service = new FrameworkMappingsService();

// Framework mappings are an Enterprise-only feature (cross-framework migration
// tooling). `requirePaidTier` gives us the SUBSCRIPTION_REQUIRED 403 envelope
// — unified with the rest of the paid feature surface — and automatic
// SUPER_ADMIN bypass.
const requireEnterprise = requirePaidTier(['enterprise']);

/**
 * GET /api/framework-mappings
 * List all active framework mappings (Enterprise only).
 */
router.get('/', authenticateJWT, requireEnterprise, async (_req, res, next) => {
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
router.get('/:id', authenticateJWT, requireEnterprise, async (req, res, next) => {
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
router.get('/:id/lookup', authenticateJWT, requireEnterprise, async (req, res, next) => {
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
