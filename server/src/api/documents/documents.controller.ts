import type { Request, Response, NextFunction } from 'express';
import { DocumentsService } from './documents.service';
import { generateDocumentSchema, updateDocumentSchema } from './documents.schema';
import { renderBusinessCasePdf } from '../../services/pdf/render-business-case';
import { ValidationError } from '../../utils/errors';
import { audit } from '../../lib/audit';

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

// Phase 14.3 — Business Case PDF export. The render service walks the
// stored DocumentSection[] and emits a Buffer; the controller fetches the
// document under tenant scope (404 on wrong owner — same shape as
// getDocument) and streams the buffer with PDF headers. Pilot scope is
// BUSINESS_CASE only; other types return 400 until the renderer supports
// their template variations (RFP/ITT carries richer tables; deferred).
//
// An audit row records the export — `Content-Disposition` filename derives
// from the title to keep the saved file recognisable on disk.
export const exportDocumentPdf = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = req.params['id'] as string;
    const doc = await service.getDocument(id, req.user!.institutionId);

    if (doc.type !== 'BUSINESS_CASE') {
      throw new ValidationError(
        `PDF export is only available for BUSINESS_CASE documents (got ${doc.type}). RFP/ITT and other templates are tracked as a follow-up.`,
      );
    }

    const sections = doc.sections as unknown as Array<{
      id: string;
      title: string;
      content: string;
      order: number;
    }>;

    const metaLine = `${doc.title} · Generated ${new Date(doc.createdAt).toLocaleDateString('en-GB')}`;
    const buffer = await renderBusinessCasePdf({
      title: doc.title,
      sections,
      metaLine,
    });

    await audit(req, {
      action: 'export.pdf',
      entityType: 'GeneratedDocument',
      entityId: doc.id,
      userId: req.user?.userId ?? null,
      changes: {
        surface: 'businessCasePdf',
        sectionCount: sections.length,
        bytes: buffer.length,
      },
    });

    const safeFilename = doc.title.replace(/[^A-Za-z0-9._ -]/g, '').slice(0, 80) || 'business-case';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.pdf"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};
