import { Router } from 'express';
import { getMethodology, getFaq, getEvidenceTypes } from './scoring.controller';

const router = Router();

router.get('/methodology', getMethodology);
router.get('/faq', getFaq);
router.get('/evidence-types', getEvidenceTypes);

export default router;
