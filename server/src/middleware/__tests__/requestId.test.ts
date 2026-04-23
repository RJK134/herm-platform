import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestId } from '../requestId';

function makeApp() {
  const app = express();
  app.use(requestId);
  app.get('/echo', (req, res) => {
    res.json({ id: req.id });
  });
  return app;
}

describe('requestId middleware', () => {
  it('generates a UUID when no header is provided', async () => {
    const res = await request(makeApp()).get('/echo');
    expect(res.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(res.headers['x-request-id']).toBe(res.body.id);
  });

  it('reuses the incoming x-request-id header', async () => {
    const res = await request(makeApp()).get('/echo').set('x-request-id', 'upstream-id-42');
    expect(res.body.id).toBe('upstream-id-42');
    expect(res.headers['x-request-id']).toBe('upstream-id-42');
  });
});
