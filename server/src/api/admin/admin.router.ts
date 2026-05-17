import { Router } from 'express';
import { authenticateJWT, requireRole } from '../../middleware/auth';
import { requirePaidTier } from '../../middleware/require-paid-tier';
import {
  listVendorAccounts,
  updateVendorAccount,
  listAllSubmissions,
  getVendorSubmissions,
  reviewSubmission,
} from './admin-vendors.controller';
import { startImpersonation, endImpersonation } from './impersonation.controller';
import { submitCsmRequest } from './csm-request.controller';
import { getBranding, putBranding } from './branding.controller';
import {
  createInvite,
  listPendingInvites,
  revokeInvite,
} from '../invites/invites.controller';
import { enforceQuota } from '../../middleware/enforceQuota';
import {
  readMe as readSsoMe,
  upsertMe as upsertSsoMe,
  deleteMe as deleteSsoMe,
  readAll as readSsoAll,
  readByInstitution as readSsoByInstitution,
  upsertByInstitution as upsertSsoByInstitution,
  deleteByInstitution as deleteSsoByInstitution,
} from './admin-sso.controller';
import {
  cascadeSoftDeleteInstitution,
  cascadeRestoreInstitution,
  cascadeRestoreUser,
} from './admin-cascade.controller';

const router = Router();

// Impersonation lives under /api/admin but uses its own role guard:
//   - start: SUPER_ADMIN only (enforced inside the controller)
//   - end:   any authenticated user holding an active impersonation token
// Both routes need authenticateJWT but NOT the INSTITUTION_ADMIN guard,
// so they're declared BEFORE the role-restricted block below. The end
// route is intentionally not role-gated — once a SUPER_ADMIN has started
// impersonating, the bearer's role is the customer's, and the controller
// validates the impersonator claim itself.
router.post('/impersonate', authenticateJWT, startImpersonation);
router.post('/impersonate/end', authenticateJWT, endImpersonation);

// Phase 16.14 — Enterprise dedicated-CSM contact form. Open to ANY
// authenticated user on an Enterprise tenant (not just admins) — the
// tier predicate is the gate, not the role. Mounted before the
// INSTITUTION_ADMIN guard below for that reason.
router.post(
  '/csm-request',
  authenticateJWT,
  requirePaidTier(['enterprise']),
  submitCsmRequest,
);

// All other admin routes require a valid JWT and INSTITUTION_ADMIN or SUPER_ADMIN role
router.use(authenticateJWT, requireRole(['SUPER_ADMIN', 'INSTITUTION_ADMIN']));

// Phase 16.13 — Enterprise white-label export branding. Both reads
// and writes are Enterprise-only AND require admin role (covered by
// the router-level guard above). The PDF / Word renderer re-checks
// tier before applying the override at render time.
router.get('/branding', requirePaidTier(['enterprise']), getBranding);
router.put('/branding', requirePaidTier(['enterprise']), putBranding);

// Phase 16.5 — team-member invitations. INSTITUTION_ADMIN / SUPER_ADMIN
// (covered by the router-level role guard above) creates a pending
// Invite row + emails the recipient a /claim link. Quota counts ACTIVE
// members, not invites — the gate here pre-checks so an admin can't
// queue more invites than there are seats left.
router.post('/users/invite', enforceQuota('team.members'), createInvite);
router.get('/users/invites', listPendingInvites);
router.delete('/users/invites/:id', revokeInvite);

router.get('/vendors', listVendorAccounts);
router.patch('/vendors/:id', updateVendorAccount);
router.get('/vendors/:id/submissions', getVendorSubmissions);
router.get('/submissions', listAllSubmissions);
router.patch('/submissions/:id', reviewSubmission);

// Phase 11.4 — SsoIdentityProvider admin (the operator was previously
// expected to write rows via raw Prisma). Scoped to the caller's
// institution; the existing INSTITUTION_ADMIN / SUPER_ADMIN guard
// applies.
router.get('/sso/me', readSsoMe);
router.put('/sso/me', upsertSsoMe);
router.delete('/sso/me', deleteSsoMe);

// Phase 11.8 — SUPER_ADMIN cross-institution panel. Each handler
// re-checks `req.user.role === 'SUPER_ADMIN'` itself; the
// INSTITUTION_ADMIN guard at the top of this router is a necessary
// but-not-sufficient gate for these specific routes.
router.get('/sso/all', readSsoAll);
router.get('/sso/institutions/:institutionId', readSsoByInstitution);
router.put('/sso/institutions/:institutionId', upsertSsoByInstitution);
router.delete('/sso/institutions/:institutionId', deleteSsoByInstitution);

// Phase 11.14 — soft-delete cascade for an entire Institution
// (subscription + users PII-scrubbed + SSO rows wiped). SUPER_ADMIN
// only; the controller re-enforces the role guard. The matching
// restore endpoints reverse `deletedAt` within the retention grace
// window — User PII scrubbed by the cascade is NOT recoverable.
router.delete('/institutions/:id', cascadeSoftDeleteInstitution);
router.post('/institutions/:id/restore', cascadeRestoreInstitution);
router.post('/users/:id/restore', cascadeRestoreUser);

export default router;
