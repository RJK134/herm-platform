import { Request, Response, NextFunction } from 'express';
import { ResearchService } from './research.service';

const service = new ResearchService();

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { publisher, category, year, tags } = req.query as {
      publisher?: string;
      category?: string;
      year?: string;
      tags?: string;
    };
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
