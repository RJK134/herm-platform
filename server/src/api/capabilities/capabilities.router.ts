import { Router } from 'express';
import { listCapabilities, getByCode, listDomains } from './capabilities.controller';

const router = Router();

router.get('/domains', listDomains);
router.get('/', listCapabilities);
router.get('/:code', getByCode);

export default router;
