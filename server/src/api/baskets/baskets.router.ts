import { Router } from 'express';
import { createBasket, listBaskets, getById, addItem, removeItem, evaluate } from './baskets.controller';

const router = Router();

router.post('/', createBasket);
router.get('/', listBaskets);
router.get('/:id', getById);
router.post('/:id/items', addItem);
router.delete('/:id/items/:itemId', removeItem);
router.get('/:id/evaluate', evaluate);

export default router;
