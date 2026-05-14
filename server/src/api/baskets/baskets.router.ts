import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth';
import { enforceQuota } from '../../middleware/enforceQuota';
import { createBasket, listBaskets, getById, addItem, removeItem, evaluate } from './baskets.controller';

const router = Router();

// All basket routes require an authenticated user. Baskets are user-scoped
// institutional data; anonymous access would leak or corrupt other tenants'
// requirement sets.
router.use(authenticateJWT);

// Phase 15.3: gate basket creation on the per-tier `baskets` quota.
// Counter increment is in the controller (post-write) so a failed
// createBasket (validation, DB constraint) doesn't burn a slot.
router.post('/', enforceQuota('baskets'), createBasket);
router.get('/', listBaskets);
router.get('/:id', getById);
router.post('/:id/items', addItem);
router.delete('/:id/items/:itemId', removeItem);
router.get('/:id/evaluate', evaluate);

export default router;
