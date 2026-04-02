import { Router } from 'express';
import { getProfile, updateProfile, getVersions } from './vendors.controller';

const router = Router();

router.get('/:id/profile', getProfile);
router.put('/:id/profile', updateProfile);
router.get('/:id/versions', getVersions);

export default router;
