/**
 * OpenAPI documentation router (Phase 10.4).
 *
 * Exposes a single endpoint, `GET /openapi.json`, returning the
 * hand-curated OpenAPI 3.1 spec as JSON. Mounted at both `/api` and
 * `/api/v1` so customers using either base can fetch it.
 *
 * Deliberately no `/docs` HTML page — that adds a Swagger-UI dependency
 * (or a CDN script tag) for marginal value over what tooling like
 * Postman / Insomnia / OpenAPI Generator already does with the JSON.
 * Adding it later is a one-liner.
 */
import { Router, type Request, type Response } from 'express';
import { openApiSpec } from './openapi.definition';

const router = Router();

router.get('/openapi.json', (_req: Request, res: Response) => {
  // Cache for 5 minutes — the spec changes only on deploy, and clients
  // (codegen, gateways) typically re-fetch on a much shorter interval.
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(openApiSpec);
});

export default router;
