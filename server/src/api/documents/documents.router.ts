import { Router } from 'express';
import { optionalJWT } from '../../middleware/auth';
import { generatePreview, saveDocument, listDocuments, getDocument, updateDocument, deleteDocument } from './documents.controller';

const router = Router();
router.use(optionalJWT);

/** POST /api/documents/generate — stateless preview (no save) */
router.post('/generate', generatePreview);

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
