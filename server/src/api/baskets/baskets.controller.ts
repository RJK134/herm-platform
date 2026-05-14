import type { Request, Response, NextFunction } from 'express';
import { BasketsService } from './baskets.service';
import { createBasketSchema, addItemSchema } from './baskets.schema';
import { recordUsage } from '../../middleware/enforceQuota';

const service = new BasketsService();

export const createBasket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createBasketSchema.parse(req.body);
    const basket = await service.createBasket(data);
    // Phase 15.3: increment the institution's monthly basket counter
    // AFTER the write succeeds. enforceQuota('baskets') has already
    // rejected when over-limit; this is the post-write bookkeeping.
    // authenticateJWT upstream guarantees req.user.institutionId — the
    // non-null assertion matches the pattern used elsewhere in the
    // codebase (e.g. createProjectV2's `req.user!.institutionId`) and
    // makes the invariant explicit instead of pretending the falsy
    // branch is reachable.
    await recordUsage(req.user!.institutionId, 'baskets');
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
