import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SystemsService } from './systems.service';

const listQuerySchema = z.object({
  category: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

const compareQuerySchema = z.object({
  ids: z.string().regex(/^[a-zA-Z0-9_,-]+$/, 'ids must be comma-separated alphanumeric IDs').optional(),
});

const service = new SystemsService();

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = listQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: query.error.errors[0]?.message ?? 'Invalid query parameters' } });
      return;
    }
    const data = await service.listSystems({ category: query.data.category, limit: query.data.limit, offset: query.data.offset });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getSystemById(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getScores = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getSystemScores(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const compare = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = compareQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: query.error.errors[0]?.message ?? 'Invalid query parameters' } });
      return;
    }
    const idList = query.data.ids ? query.data.ids.split(',').filter(Boolean) : [];
    if (idList.length < 2) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'At least 2 system IDs required' } });
      return;
    }
    const data = await service.compareSystems(idList);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
