import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodTypeAny } from 'zod';
import { z } from 'zod';

export function validateBody<T extends ZodSchema>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateQuery<T extends ZodSchema>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req.query);
      // Express query is read-only in newer typings; assign via Object.defineProperty
      Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateParams<T extends ZodSchema>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as Request['params'];
      next();
    } catch (err) {
      next(err);
    }
  };
}

export interface ValidateSpec {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validate any combination of body/query/params in a single middleware.
 * Non-provided sections are left untouched.
 */
export function validate(spec: ValidateSpec) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (spec.body) req.body = spec.body.parse(req.body);
      if (spec.params) req.params = spec.params.parse(req.params) as Request['params'];
      if (spec.query) {
        const parsed = spec.query.parse(req.query);
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const idParamSchema = z.object({
  id: z.string().min(1).max(128),
});
