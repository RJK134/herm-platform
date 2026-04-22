import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { sendMessage } from './chat.controller';
import { errorHandler } from '../../middleware/errorHandler';
import { requestId } from '../../middleware/requestId';

vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const chatMock = vi.fn();
vi.mock('../../services/ai/ai-assistant', () => ({
  chat: (...args: unknown[]) => chatMock(...args),
  getHistory: vi.fn(),
  clearHistory: vi.fn(),
}));

function buildApp(opts: { mountFrameworkContext: boolean }) {
  const app = express();
  app.use(requestId);
  app.use(express.json());

  // Fake authenticateJWT that just populates req.user from a Bearer token
  app.use((req, _res, next) => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(header.slice(7), 'dev-secret') as jwt.JwtPayload;
        req.user = payload as typeof req.user;
      } catch {
        // ignore — the controller's own requireUser guard will reject
      }
    }
    next();
  });

  if (opts.mountFrameworkContext) {
    app.use((req, _res, next) => {
      req.frameworkId = 'fw-test';
      req.framework = {
        id: 'fw-test',
        slug: 'fhe-capability-framework',
        name: 'FHE Capability Framework',
        isPublic: false,
        isDefault: true,
        licenceType: 'PROPRIETARY',
        publisher: 'FHE',
        licenceUrl: null,
        licenceNotice: null,
      };
      next();
    });
  }

  app.post('/api/chat', sendMessage);
  app.use(errorHandler);
  return app;
}

const validToken = jwt.sign(
  {
    userId: 'user-1',
    email: 'a@b.co',
    name: 'A',
    role: 'INSTITUTION_ADMIN',
    institutionId: 'inst-1',
    institutionName: 'Inst',
    tier: 'professional',
  },
  'dev-secret',
  { expiresIn: '1h' },
);

describe('chat.controller — requireFramework guard', () => {
  beforeEach(() => {
    chatMock.mockReset();
    chatMock.mockResolvedValue('pong');
  });

  it('returns 500 INTERNAL_ERROR when frameworkContext is not mounted', async () => {
    const res = await request(buildApp({ mountFrameworkContext: false }))
      .post('/api/chat')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ sessionId: 's1', message: 'hi' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toMatch(/framework context missing/i);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('forwards the full framework to the chat service when the middleware is mounted', async () => {
    const res = await request(buildApp({ mountFrameworkContext: true }))
      .post('/api/chat')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ sessionId: 's1', message: 'hi' });

    expect(res.status).toBe(200);
    expect(chatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's1',
        userId: 'user-1',
        userMessage: 'hi',
        framework: { id: 'fw-test', name: 'FHE Capability Framework' },
      }),
    );
  });
});
