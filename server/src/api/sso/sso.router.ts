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
 */
import { Router } from 'express';
import express from 'express';
import {
  discover,
  discoverByEmail,
  spMetadata,
  login,
  samlAcs,
  oidcCallback,
} from './sso.controller';

const router = Router();

router.get('/discover', discoverByEmail);
router.get('/sp-metadata.xml', spMetadata);

router.get('/:institutionSlug/discover', discover);
router.get('/:institutionSlug/login', login);
router.post(
  '/:institutionSlug/saml/acs',
  // SAMLResponse arrives form-urlencoded. 1 MB cap mirrors the global
  // express.json limit; well over any realistic SAMLResponse size.
  express.urlencoded({ extended: false, limit: '1mb' }),
  samlAcs,
);
router.get('/:institutionSlug/oidc/callback', oidcCallback);

export default router;
