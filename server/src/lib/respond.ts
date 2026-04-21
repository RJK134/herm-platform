import type { Response } from 'express';

export interface ApiMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  [key: string]: unknown;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export function ok<T>(res: Response, data: T, meta?: ApiMeta): Response<ApiSuccess<T>> {
  const body: ApiSuccess<T> = meta ? { success: true, data, meta } : { success: true, data };
  return res.json(body);
}

export function created<T>(res: Response, data: T): Response<ApiSuccess<T>> {
  return res.status(201).json({ success: true, data });
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}
