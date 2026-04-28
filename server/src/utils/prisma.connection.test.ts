/**
 * Unit tests for the DB-resilience defaults applied to DATABASE_URL.
 * Covers: bare URL → defaults added; existing knobs preserved; malformed
 * URLs pass through; existing query params preserved alongside defaults.
 *
 * Mocks @prisma/client so importing prisma.ts doesn't try to load the
 * generated client (which the test suite doesn't need for this file).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@prisma/client', () => ({
  PrismaClient: class MockPrismaClient {
    constructor(_opts?: unknown) {}
  },
}));

import { applyConnectionDefaults } from './prisma';

describe('applyConnectionDefaults', () => {
  it('returns undefined when input is undefined', () => {
    expect(applyConnectionDefaults(undefined)).toBeUndefined();
  });

  it('passes through a malformed URL unchanged (env-check has already warned)', () => {
    expect(applyConnectionDefaults('not a url')).toBe('not a url');
  });

  it('appends both defaults to a bare postgres URL', () => {
    const out = applyConnectionDefaults('postgresql://user:pass@host:5432/db');
    expect(out).toBeDefined();
    const u = new URL(out!);
    expect(u.searchParams.get('connection_limit')).toBe('10');
    expect(u.searchParams.get('options')).toBe('-c statement_timeout=15000');
  });

  it('encodes spaces in options as %20 (not + per form-encoding) so libpq parses correctly', () => {
    // URLSearchParams.toString() emits `+` for space (form-encoding); libpq's
    // connection-string parser treats `+` as a literal plus, which would
    // corrupt our `-c statement_timeout=…` flag into the unknown option name
    // `-c+statement_timeout`. The Postgres GUC would silently never be set.
    // Lock the wire format here so we can't regress it again.
    const out = applyConnectionDefaults('postgresql://u:p@h:5432/d')!;
    expect(out).toContain('options=-c%20statement_timeout%3D15000');
    expect(out).not.toMatch(/options=-c\+/);
  });

  it('preserves credentials, host, and path when rebuilding the URL', () => {
    const out = applyConnectionDefaults('postgresql://herm:s3cr3t@db.example.com:5433/herm_prod')!;
    expect(out.startsWith('postgresql://herm:s3cr3t@db.example.com:5433/herm_prod?')).toBe(true);
  });

  it('preserves an explicit connection_limit', () => {
    const out = applyConnectionDefaults('postgresql://user@host/db?connection_limit=25');
    const u = new URL(out!);
    expect(u.searchParams.get('connection_limit')).toBe('25');
    // options default still applied
    expect(u.searchParams.get('options')).toBe('-c statement_timeout=15000');
  });

  it('preserves an explicit options value', () => {
    const out = applyConnectionDefaults(
      'postgresql://user@host/db?options=-c%20statement_timeout%3D60000',
    );
    const u = new URL(out!);
    expect(u.searchParams.get('options')).toBe('-c statement_timeout=60000');
    // connection_limit default still applied
    expect(u.searchParams.get('connection_limit')).toBe('10');
  });

  it('is a no-op when both knobs are already set', () => {
    const input = 'postgresql://user@host/db?connection_limit=25&options=-c%20application_name%3Dapp';
    const out = applyConnectionDefaults(input);
    const u = new URL(out!);
    expect(u.searchParams.get('connection_limit')).toBe('25');
    expect(u.searchParams.get('options')).toBe('-c application_name=app');
  });

  it('preserves unrelated query params (e.g. schema, sslmode)', () => {
    const out = applyConnectionDefaults(
      'postgresql://user@host/db?schema=public&sslmode=require',
    );
    const u = new URL(out!);
    expect(u.searchParams.get('schema')).toBe('public');
    expect(u.searchParams.get('sslmode')).toBe('require');
    expect(u.searchParams.get('connection_limit')).toBe('10');
    expect(u.searchParams.get('options')).toBe('-c statement_timeout=15000');
  });

  it('normalises an operator-supplied + in options to %20 (semantic value preserved)', () => {
    // If an operator typed `+` in their existing options (e.g. via a misconfigured
    // template), the URL parser decodes it to space; we then re-emit as %20. The
    // semantic value libpq sees is unchanged, but the wire format is now safe.
    const out = applyConnectionDefaults(
      'postgresql://u@h/d?options=-c+application_name%3Dapp',
    )!;
    expect(out).toContain('options=-c%20application_name%3Dapp');
    expect(out).not.toContain('options=-c+');
  });
});
