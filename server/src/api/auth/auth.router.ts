import { Router } from 'express';
import { authenticateJWT, optionalJWT } from '../../middleware/auth';
import { register, login, me, updateProfile, logout } from './auth.controller';

const router = Router();

/** POST /api/auth/register — create new account + institution */
router.post('/register', register);

/** POST /api/auth/login — exchange credentials for JWT */
router.post('/login', login);

/** GET /api/auth/me — return current user profile (requires JWT) */
router.get('/me', authenticateJWT, me);

/** PATCH /api/auth/me — update display name */
router.patch('/me', authenticateJWT, updateProfile);

/** POST /api/auth/logout — client-side logout confirmation. `optionalJWT`
 *  so we can write an `auth.logout` audit row when the caller is still
 *  carrying a valid token. Anonymous logout (or expired-token logout) is
 *  silent. */
router.post('/logout', optionalJWT, logout);

export default router;
