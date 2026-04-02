import { Router } from 'express';
import { authenticateJWT, requireRole } from '../../middleware/auth';
import {
  getMyInstitution,
  updateMyInstitution,
  listUsers,
  updateUserRole,
} from './institutions.controller';

const router = Router();

// All institution routes require authentication
router.use(authenticateJWT);

/** GET /api/institutions/me — get own institution with subscription */
router.get('/me', getMyInstitution);

/** PATCH /api/institutions/me — update institution details (admin only) */
router.patch(
  '/me',
  requireRole(['INSTITUTION_ADMIN', 'SUPER_ADMIN']),
  updateMyInstitution
);

/** GET /api/institutions/me/users — list institution users (admin only) */
router.get(
  '/me/users',
  requireRole(['INSTITUTION_ADMIN', 'SUPER_ADMIN']),
  listUsers
);

/** PATCH /api/institutions/me/users/:userId/role — update user role (admin only) */
router.patch(
  '/me/users/:userId/role',
  requireRole(['INSTITUTION_ADMIN', 'SUPER_ADMIN']),
  updateUserRole
);

export default router;
