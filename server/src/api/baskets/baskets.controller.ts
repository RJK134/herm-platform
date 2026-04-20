import type { Request, Response, NextFunction } from 'express';
import { BasketsService } from './baskets.service';
import { createBasketSchema, addItemSchema } from './baskets.schema';

const service = new BasketsService();

export const createBasket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createBasketSchema.parse(req.body);
    const basket = await service.createBasket(data);
    res.status(201).json({ success: true, data: basket });
  } catch (err) {
    next(err);
  }
};

export const listBaskets = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.listBaskets();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.getBasketById(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const addItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = addItemSchema.parse(req.body);
    const basket = await service.addItem(req.params['id'] as string, data);
    res.status(201).json({ success: true, data: basket });
  } catch (err) {
    next(err);
  }
};

export const removeItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await service.removeItem(req.params['id'] as string, req.params['itemId'] as string);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
};

export const evaluate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await service.evaluateBasket(req.params['id'] as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
