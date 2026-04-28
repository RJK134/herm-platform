/**
 * Unit tests for the Sentry wrapper. Mocks `@sentry/node` so we can assert
 * on call shapes without spinning up a real client.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sentryMock = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}));
vi.mock('@sentry/node', () => sentryMock);

import { initSentry, captureServerError, flushSentry, __resetSentryForTests } from './sentry';

describe('lib/sentry wrapper', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    sentryMock.init.mockClear();
    sentryMock.captureException.mockClear();
    sentryMock.flush.mockClear();
    __resetSentryForTests();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('initSentry is a no-op when SENTRY_DSN is unset', () => {
    delete process.env['SENTRY_DSN'];
    initSentry();
    expect(sentryMock.init).not.toHaveBeenCalled();
  });

  it('initSentry calls Sentry.init with DSN, environment, and tracesSampleRate', () => {
    process.env['SENTRY_DSN'] = 'https://k@o.ingest.sentry.io/1';
    process.env['SENTRY_ENVIRONMENT'] = 'staging';
    process.env['SENTRY_TRACES_SAMPLE_RATE'] = '0.25';
    initSentry();
    expect(sentryMock.init).toHaveBeenCalledOnce();
    const opts = sentryMock.init.mock.calls[0]![0]!;
    expect(opts.dsn).toBe('https://k@o.ingest.sentry.io/1');
    expect(opts.environment).toBe('staging');
    expect(opts.tracesSampleRate).toBe(0.25);
  });

  it('initSentry clamps an out-of-range traces sample rate to 0', () => {
    process.env['SENTRY_DSN'] = 'https://k@o.ingest.sentry.io/1';
    process.env['SENTRY_TRACES_SAMPLE_RATE'] = '5';
    initSentry();
    expect(sentryMock.init.mock.calls[0]![0]!.tracesSampleRate).toBe(0);
  });

  it('initSentry is idempotent — second call does not re-init', () => {
    process.env['SENTRY_DSN'] = 'https://k@o.ingest.sentry.io/1';
    initSentry();
    initSentry();
    expect(sentryMock.init).toHaveBeenCalledOnce();
  });

  it('captureServerError is a no-op when Sentry has not been initialised', () => {
    delete process.env['SENTRY_DSN'];
    initSentry();
    captureServerError(new Error('x'));
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it('captureServerError forwards request-context tags and userId', () => {
    process.env['SENTRY_DSN'] = 'https://k@o.ingest.sentry.io/1';
    initSentry();
    const err = new Error('boom');
    captureServerError(err, {
      requestId: 'req-1',
      userId: 'user-9',
      path: '/api/x',
      method: 'POST',
    });
    expect(sentryMock.captureException).toHaveBeenCalledOnce();
    const [capturedErr, opts] = sentryMock.captureException.mock.calls[0]!;
    expect(capturedErr).toBe(err);
    expect(opts.tags).toEqual({
      requestId: 'req-1',
      'http.path': '/api/x',
      'http.method': 'POST',
    });
    expect(opts.user).toEqual({ id: 'user-9' });
  });

  it('captureServerError omits user when no userId is provided', () => {
    process.env['SENTRY_DSN'] = 'https://k@o.ingest.sentry.io/1';
    initSentry();
    captureServerError(new Error('x'), { requestId: 'r' });
    const opts = sentryMock.captureException.mock.calls[0]![1]!;
    expect(opts.user).toBeUndefined();
  });

  it('flushSentry is a no-op when not initialised', async () => {
    delete process.env['SENTRY_DSN'];
    initSentry();
    await flushSentry();
    expect(sentryMock.flush).not.toHaveBeenCalled();
  });

  it('flushSentry calls Sentry.flush with the timeout', async () => {
    process.env['SENTRY_DSN'] = 'https://k@o.ingest.sentry.io/1';
    initSentry();
    await flushSentry(1500);
    expect(sentryMock.flush).toHaveBeenCalledWith(1500);
  });
});
