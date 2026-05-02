/**
 * SSO router (Phase 10.7 scaffold + Phase 10.10 auth flows).
 *
 * Anonymous routes — by design, the user has no JWT yet. Tier-gating
 * for the auth flows is enforced at the institution level inside
 * `sso.service.resolveSsoForFlow`, since `requirePaidTier` reads
 * `req.user` which is absent here.
 *
 * Route ordering matters:
 *   - `/discover` (no slug) MUST come before `/:institutionSlug/discover`,
 *     otherwise Express matches the `:institutionSlug` placeholder
 *     against the literal "discover".
 *   - `/sp-metadata.xml` MUST come before `/:institutionSlug/...` for
 *     the same reason.
 *
 * The SAML ACS uses POST with `application/x-www-form-urlencoded` (the
 * IdP's HTML auto-post form posts SAMLResponse + RelayState). Express's
 * default JSON body parser doesn't handle that — the urlencoded parser
 * is added inline as middleware on the ACS route only, so the rest of
 * the API doesn't pick up form bodies.
 *
 * Phase 11.15 (M3) — `discoveryRateLimiter` is mounted directly on the
 * two anonymous discovery routes (NOT on the auth flow / ACS / metadata
 * surfaces). After Phase 11.13 `/api/sso/[:slug/]discover` returns an
 * `options[]` array of every enabled IdP, so an attacker who knows a
 * slug or domain can enumerate the tenant's IdP map. Without a tighter
 * limiter these endpoints share the global `apiRateLimiter` bucket
 * with `/api/health`, so a single misbehaving probe can starve the
 * whole anonymous bucket. Scoped here at the route mount so the limiter
 * is applied without touching `sso.controller.ts` (avoids a merge
 * collision with the in-flight `claude/p11-slo-replay` PR).
 */
import { Router } from 'express';
import express from 'express';
import { discoveryRateLimiter } from '../../middleware/security';
import {
  discover,
  discoverByEmail,
  spMetadata,
  login,
  samlAcs,
  oidcCallback,
  samlSlo,
} from './sso.controller';

const router = Router();

router.get('/discover', discoveryRateLimiter, discoverByEmail);
router.get('/sp-metadata.xml', spMetadata);

router.get('/:institutionSlug/discover', discoveryRateLimiter, discover);
router.get('/:institutionSlug/login', login);
router.post(
  '/:institutionSlug/saml/acs',
  // SAMLResponse arrives form-urlencoded. 1 MB cap mirrors the global
  // express.json limit; well over any realistic SAMLResponse size.
  express.urlencoded({ extended: false, limit: '1mb' }),
  samlAcs,
);
router.get('/:institutionSlug/oidc/callback', oidcCallback);

// Phase 11.12 — IdP-initiated SAML Single Logout. The IdP sends a
// LogoutRequest via HTTP-Redirect; we verify the signature, look up
// every active session for the asserted NameID + SessionIndex, and
// revoke them through the session store.
router.get('/:institutionSlug/saml/slo', samlSlo);

export default router;
