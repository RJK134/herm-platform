/**
 * SSO router (Phase 10.7 — scaffold only).
 *
 * Currently exposes:
 *   GET /api/sso/:institutionSlug/discover
 *
 * The auth flow routes (/login, /saml/acs, /oidc/callback) ship in a
 * follow-up PR. Until then, hitting them returns 404 from the global
 * not-found handler, which is the right behaviour for a frontend that
 * checks discovery before redirecting.
 *
 * No global authenticateJWT — discovery is anonymous by design (the
 * frontend calls it from /login before the user has a token).
 */
import { Router } from 'express';
import { discover } from './sso.controller';

const router = Router();

router.get('/:institutionSlug/discover', discover);

export default router;
