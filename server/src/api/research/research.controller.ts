import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ResearchService } from './research.service';

const listQuerySchema = z.object({
  publisher: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(100).optional(),
  year: z.string().regex(/^\d{4}$/, 'year must be a 4-digit number').optional(),
  tags: z.string().max(500).optional(),
});

const service = new ResearchService();

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = listQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: query.error.errors[0]?.message ?? 'Invalid query parameters' } });
      return;
    }
    const { publisher, category, year, tags } = query.data;
    const data = await service.list({
      publisher,
      category,
      year: year ? Number(year) : undefined,
      tags,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getById(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.create(req.body as Parameters<typeof service.create>[0]);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.update(
      req.params['id'] as string,
      req.body as Parameters<typeof service.update>[1],
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.remove(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
