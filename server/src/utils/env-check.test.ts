/**
 * Unit tests for `checkEnvironment` — the boot-time guard that fails loudly
 * in production when required env is missing or paired settings are
 * inconsistent. Stripe pairing (Workstream G) is the primary case here:
 * STRIPE_SECRET_KEY without STRIPE_WEBHOOK_SECRET silently breaks every
 * webhook delivery, so we want a fatal error in production rather than a
 * silent no-op.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkEnvironment } from './env-check';

const REQUIRED_BASELINE = {
  DATABASE_URL: 'postgresql://postgres@localhost:5432/herm_test?schema=public',
  JWT_SECRET: 'a'.repeat(48),
};

describe('checkEnvironment — Stripe secret pairing (Workstream G)', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Wipe the relevant keys so each test starts from a known baseline.
    delete process.env['NODE_ENV'];
    delete process.env['STRIPE_SECRET_KEY'];
    delete process.env['STRIPE_WEBHOOK_SECRET'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['DEV_UNLOCK_ALL_TIERS'];
    Object.assign(process.env, REQUIRED_BASELINE);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  it('production + STRIPE_SECRET_KEY set + STRIPE_WEBHOOK_SECRET unset → throws', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['STRIPE_SECRET_KEY'] = 'sk_live_xxx';
    expect(() => checkEnvironment()).toThrow(/Missing required environment variables/);
    // Specifically the Stripe pairing line should be in the fatal block.
    const fatalLines = consoleError.mock.calls.flat().join('\n');
    expect(fatalLines).toMatch(/STRIPE_SECRET_KEY.*STRIPE_WEBHOOK_SECRET/);
  });

  it('development + STRIPE_SECRET_KEY set + STRIPE_WEBHOOK_SECRET unset → warning, no throw', () => {
    process.env['NODE_ENV'] = 'development';
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_xxx';
    expect(() => checkEnvironment()).not.toThrow();
    const warnLines = consoleWarn.mock.calls.flat().join('\n');
    expect(warnLines).toMatch(/STRIPE_SECRET_KEY.*STRIPE_WEBHOOK_SECRET/);
  });

  it('production + both set → no throw, no Stripe-pairing warning', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['STRIPE_SECRET_KEY'] = 'sk_live_xxx';
    process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_xxx';
    expect(() => checkEnvironment()).not.toThrow();
    const allOutput = [...consoleError.mock.calls, ...consoleWarn.mock.calls].flat().join('\n');
    expect(allOutput).not.toMatch(/STRIPE_SECRET_KEY.*STRIPE_WEBHOOK_SECRET/);
  });

  it('production + neither set → no throw, no Stripe-pairing complaint (Stripe is genuinely off)', () => {
    process.env['NODE_ENV'] = 'production';
    // STRIPE_SECRET_KEY unset → billing is intentionally disabled, no pairing concern.
    expect(() => checkEnvironment()).not.toThrow();
    const allOutput = [...consoleError.mock.calls, ...consoleWarn.mock.calls].flat().join('\n');
    expect(allOutput).not.toMatch(/STRIPE_SECRET_KEY is set/);
  });
});
