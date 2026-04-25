import { Router } from 'express';
import { authenticateJWT, optionalJWT } from '../../middleware/auth';
import { generatePreview, saveDocument, listDocuments, getDocument, updateDocument, deleteDocument } from './documents.controller';

const router = Router();

/** POST /api/documents/generate — stateless preview (no save). Public-friendly. */
router.post('/generate', optionalJWT, generatePreview);

// Persisted documents are tenant-scoped per HERM_COMPLIANCE.md
// "Authenticated (any tier)". JWT is mandatory on the persisted-write
// surface so `institutionId` is always stamped from the token rather
// than the request body.
router.use(authenticateJWT);

/** POST /api/documents — generate + save */
router.post('/', saveDocument);

/** GET /api/documents — list saved documents */
router.get('/', listDocuments);

/** GET /api/documents/:id */
router.get('/:id', getDocument);

/** PATCH /api/documents/:id — update sections/status */
router.patch('/:id', updateDocument);

/** DELETE /api/documents/:id */
router.delete('/:id', deleteDocument);

export default router;
