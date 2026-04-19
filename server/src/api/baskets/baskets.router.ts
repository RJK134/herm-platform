import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth';
import { createBasket, listBaskets, getById, addItem, removeItem, evaluate } from './baskets.controller';

const router = Router();

// All basket routes require an authenticated user. Baskets are user-scoped
// institutional data; anonymous access would leak or corrupt other tenants'
// requirement sets.
router.use(authenticateJWT);

router.post('/', createBasket);
router.get('/', listBaskets);
router.get('/:id', getById);
router.post('/:id/items', addItem);
router.delete('/:id/items/:itemId', removeItem);
router.get('/:id/evaluate', evaluate);

export default router;
