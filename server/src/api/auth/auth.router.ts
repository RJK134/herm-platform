import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth';
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

/** POST /api/auth/logout — record an `auth.logout` audit row and confirm
 *  client-side token disposal. `authenticateJWT` (not optionalJWT) because
 *  the route persists an audit row keyed to req.user.userId. Anonymous /
 *  expired-token logout returns 401, which the client's axios interceptor
 *  maps to the same "clear token and redirect to /login" UX as success. */
router.post('/logout', authenticateJWT, logout);

export default router;
