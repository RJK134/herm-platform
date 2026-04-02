import { Router } from 'express';
import { listCapabilities, getByCode, listFamilies } from './capabilities.controller';

const router = Router();

router.get('/families', listFamilies);
router.get('/', listCapabilities);
router.get('/:code', getByCode);

export default router;
