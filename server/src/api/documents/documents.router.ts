import { Router } from 'express';
import { authenticateJWT, optionalJWT } from '../../middleware/auth';
import { enforceQuota } from '../../middleware/enforceQuota';
import {
  generatePreview,
  saveDocument,
  listDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
  exportDocumentPdf,
} from './documents.controller';

const router = Router();

/** POST /api/documents/generate — stateless preview (no save). Public-friendly. */
router.post('/generate', optionalJWT, generatePreview);

// Persisted documents are tenant-scoped per HERM_COMPLIANCE.md
// "Authenticated (any tier)". JWT is mandatory on the persisted-write
// surface so `institutionId` is always stamped from the token rather
// than the request body.
router.use(authenticateJWT);

/**
 * POST /api/documents — generate + save.
 * Phase 16.6: gated on the per-tier `document.generation` quota
 * (Free 5/mo, Pro/Enterprise unlimited). The preview route stays
 * ungated since it doesn't persist; only saves count toward the
 * monthly cap.
 */
router.post('/', enforceQuota('document.generation'), saveDocument);

/** GET /api/documents — list saved documents */
router.get('/', listDocuments);

/** GET /api/documents/:id */
router.get('/:id', getDocument);

/** PATCH /api/documents/:id — update sections/status */
router.patch('/:id', updateDocument);

/** DELETE /api/documents/:id */
router.delete('/:id', deleteDocument);

/**
 * GET /api/documents/:id/export.pdf — Phase 14.3 Business Case PDF export.
 * Tenant-scoped via the parent router's authenticateJWT; pilot is
 * BUSINESS_CASE only (other types return 400).
 */
router.get('/:id/export.pdf', exportDocumentPdf);

export default router;
