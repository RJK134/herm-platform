import { Router } from 'express';
import { authenticateJWT, requireRole } from '../../middleware/auth';
import { list, getById, create, update, remove } from './research.controller';

const router = Router();

const adminOnly = [authenticateJWT, requireRole(['INSTITUTION_ADMIN', 'SUPER_ADMIN'])];

// Reads are open — research is reference data
router.get('/', list);
router.get('/:id', getById);

// Mutations require institution or super admin
router.post('/', adminOnly, create);
router.put('/:id', adminOnly, update);
router.delete('/:id', adminOnly, remove);

export default router;
