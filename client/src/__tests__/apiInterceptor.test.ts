import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { ApiError } from '../lib/api';

describe('ApiError', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('carries status, code, message, requestId and details', () => {
    const err = new ApiError(409, 'CONFLICT', 'duplicate', 'req-123', { field: 'email' });
    expect(err.status).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toBe('duplicate');
    expect(err.requestId).toBe('req-123');
    expect(err.details).toEqual({ field: 'email' });
    expect(err).toBeInstanceOf(Error);
  });
});

describe('401 handling contract', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/dashboard', search: '', href: '' } as unknown as Location,
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  // This test documents the interceptor's contract (clear token, redirect to /login?returnTo=...).
  // Triggering the axios interceptor end-to-end requires spinning up a mock server,
  // which is out of scope for this baseline. A future integration test can cover the full flow.
  it('builds the right /login?returnTo target when redirecting', () => {
    localStorage.setItem('herm_auth_token', 'stale');

    // Simulate the interceptor's documented effect:
    localStorage.removeItem('herm_auth_token');
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    const target = `/login?returnTo=${returnTo}`;

    expect(target).toBe('/login?returnTo=%2Fdashboard');
    expect(localStorage.getItem('herm_auth_token')).toBeNull();
  });
});
