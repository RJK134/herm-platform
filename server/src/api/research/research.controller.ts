import type { Request, Response, NextFunction } from 'express';
import { ResearchService } from './research.service';
import {
  createResearchSchema,
  updateResearchSchema,
  listResearchQuerySchema,
} from './research.schema';
import { ok, created } from '../../lib/respond';

const service = new ResearchService();

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { publisher, category, year, tags } = listResearchQuerySchema.parse(req.query);
    const data = await service.list({
      publisher,
      category,
      year: year ? Number(year) : undefined,
      tags,
    });
    ok(res, data);
  } catch (err) {
    next(err);
  }
};

export const getById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = await service.getById(req.params['id'] as string);
    ok(res, data);
  } catch (err) {
    next(err);
  }
};

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const input = createResearchSchema.parse(req.body);
    const data = await service.create(input);
    created(res, data);
  } catch (err) {
    next(err);
  }
};

export const update = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const input = updateResearchSchema.parse(req.body);
    const data = await service.update(req.params['id'] as string, input);
    ok(res, data);
  } catch (err) {
    next(err);
  }
};

export const remove = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = await service.remove(req.params['id'] as string);
    ok(res, data);
  } catch (err) {
    next(err);
  }
};
