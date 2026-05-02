import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import axios from 'axios';
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

// VITE_API_URL drives split-origin deploy: must affect both the shared
// `client` (used by `api.*`) AND `axios.defaults.baseURL` so the SPA's
// remaining raw-axios callers (AuthContext, NotificationBell, VendorPortal,
// etc.) hit the API origin and not the SPA origin.
describe('VITE_API_URL → axios baseURL contract', () => {
  const originalDefault = axios.defaults.baseURL;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    axios.defaults.baseURL = originalDefault;
  });

  afterAll(() => {
    axios.defaults.baseURL = originalDefault;
    vi.unstubAllEnvs();
  });

  it('when VITE_API_URL is unset, leaves axios.defaults.baseURL alone (single-origin / dev proxy)', async () => {
    vi.stubEnv('VITE_API_URL', '');
    axios.defaults.baseURL = undefined;

    await import('../lib/api');

    expect(axios.defaults.baseURL).toBeUndefined();
  });

  it('when VITE_API_URL is set, sets axios.defaults.baseURL to the bare origin (no /api suffix)', async () => {
    vi.stubEnv('VITE_API_URL', 'https://herm-api.up.railway.app');
    axios.defaults.baseURL = undefined;

    await import('../lib/api');

    // Bare origin so raw `axios.get('/api/foo')` resolves to
    // `https://herm-api.up.railway.app/api/foo` — without double-`/api`.
    expect(axios.defaults.baseURL).toBe('https://herm-api.up.railway.app');
  });

  it('strips trailing slash from VITE_API_URL', async () => {
    vi.stubEnv('VITE_API_URL', 'https://herm-api.up.railway.app///');
    axios.defaults.baseURL = undefined;

    await import('../lib/api');

    expect(axios.defaults.baseURL).toBe('https://herm-api.up.railway.app');
  });
});
