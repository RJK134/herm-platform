import type { Request, Response, NextFunction } from 'express';
import { DocumentsService } from './documents.service';
import { generateDocumentSchema, updateDocumentSchema } from './documents.schema';

const service = new DocumentsService();

export const generatePreview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = generateDocumentSchema.parse(req.body);
    if (req.user) { data.institutionId = req.user.institutionId; data.institutionName = data.institutionName ?? req.user.institutionName; }
    const result = await service.generate(data);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const saveDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = generateDocumentSchema.parse(req.body);
    if (req.user) { data.institutionId = req.user.institutionId; data.institutionName = data.institutionName ?? req.user.institutionName; }
    const doc = await service.saveDocument(data);
    res.status(201).json({ success: true, data: doc });
  } catch (err) { next(err); }
};

// list/get/update/delete are tenant-scoped — `institutionId` comes from the
// JWT (router-level authenticateJWT guarantees req.user). A wrong-owner id
// surfaces as 404 (NotFoundError → errorHandler) so we never confirm a row
// belongs to a different tenant.

export const listDocuments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.listDocuments(req.user!.institutionId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const getDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getDocument(req.params['id'] as string, req.user!.institutionId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const updateDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = updateDocumentSchema.parse(req.body);
    const doc = await service.updateDocument(req.params['id'] as string, req.user!.institutionId, data);
    res.json({ success: true, data: doc });
  } catch (err) { next(err); }
};

export const deleteDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await service.deleteDocument(req.params['id'] as string, req.user!.institutionId);
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
};
