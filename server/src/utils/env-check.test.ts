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
  // Phase 10.10 — sso-config.ts requires both browser- and API-facing
  // origins in production. These tests aren't about SSO env-checks per
  // se, so set them to dummy values so the unrelated production-flow
  // assertions can run without tripping the SSO required-in-prod
  // guard.
  FRONTEND_URL: 'https://app.test',
  SP_BASE_URL: 'https://api.test',
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
    // Phase 16 test-paydown: PR #146 added prod-mode validation for the
    // Stripe price-ID envs but its sibling test-file edits didn't ship.
    // Two tests below ("production + both set → no throw" and "production
    // + neither set → no throw") rely on these being absent, but if the
    // host/CI env has them set (or a prior test set them and afterEach
    // restored a polluted snapshot) the prod-only check fires and the
    // assertions invert. Explicitly delete them here.
    delete process.env['STRIPE_PRICE_INST_PRO'];
    delete process.env['STRIPE_PRICE_INST_ENT'];
    delete process.env['STRIPE_PRICE_VENDOR_ENH'];
    delete process.env['STRIPE_PRICE_VENDOR_PREM'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['DEV_UNLOCK_ALL_TIERS'];
    delete process.env['FRONTEND_URL'];
    delete process.env['SP_BASE_URL'];
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

  it('production + both set + price IDs → no throw, no Stripe-pairing warning', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['STRIPE_SECRET_KEY'] = 'sk_live_xxx';
    process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_xxx';
    // Phase 16.11 (PR #146) introduced a prod-mode check that requires
    // the price IDs whenever STRIPE_SECRET_KEY is set. Without them this
    // "happy path" assertion would inadvertently exercise the missing-
    // price-IDs failure path. Set both so the test stays focused on the
    // pairing-warning behaviour it was originally written to pin.
    process.env['STRIPE_PRICE_INST_PRO'] = 'price_pro_test';
    process.env['STRIPE_PRICE_INST_ENT'] = 'price_ent_test';
    expect(() => checkEnvironment()).not.toThrow();
    const allOutput = [...consoleError.mock.calls, ...consoleWarn.mock.calls].flat().join('\n');
    expect(allOutput).not.toMatch(/STRIPE_SECRET_KEY.*STRIPE_WEBHOOK_SECRET/);
  });

  it('production + neither set → no throw, no Stripe-pairing complaint (Stripe is genuinely off)', () => {
    process.env['NODE_ENV'] = 'production';
    // STRIPE_SECRET_KEY unset → billing is intentionally disabled, no pairing concern.
    expect(() => checkEnvironment()).not.toThrow();
    const allOutput = [...consoleError.mock.calls, ...consoleWarn.mock.calls].flat().join('\n');
    // Tighten the regex to the actual pairing-warning text. The earlier
    // `/STRIPE_SECRET_KEY is set/` false-matched the description of
    // STRIPE_PRICE_INST_PRO in the "Optional environment variables not
    // set" list ("…REQUIRED in production when STRIPE_SECRET_KEY is set…").
    expect(allOutput).not.toMatch(/STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET/);
  });
});

describe('checkEnvironment — SSO origin pairing (Phase 10.10)', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env['NODE_ENV'];
    delete process.env['FRONTEND_URL'];
    delete process.env['SP_BASE_URL'];
    Object.assign(process.env, {
      DATABASE_URL: REQUIRED_BASELINE.DATABASE_URL,
      JWT_SECRET: REQUIRED_BASELINE.JWT_SECRET,
    });
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  it('production + FRONTEND_URL unset → throws with token-leak rationale', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['SP_BASE_URL'] = 'https://api.test';
    expect(() => checkEnvironment()).toThrow(/Missing required environment variables/);
    const fatalLines = consoleError.mock.calls.flat().join('\n');
    expect(fatalLines).toMatch(/FRONTEND_URL is required in production/);
  });

  it('production + SP_BASE_URL unset → throws with broken-callback-URL rationale', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['FRONTEND_URL'] = 'https://app.test';
    expect(() => checkEnvironment()).toThrow(/Missing required environment variables/);
    const fatalLines = consoleError.mock.calls.flat().join('\n');
    expect(fatalLines).toMatch(/SP_BASE_URL is required in production/);
  });

  it('production + both set → no SSO-pairing complaint', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['FRONTEND_URL'] = 'https://app.test';
    process.env['SP_BASE_URL'] = 'https://api.test';
    expect(() => checkEnvironment()).not.toThrow();
    const allOutput = [...consoleError.mock.calls, ...consoleWarn.mock.calls].flat().join('\n');
    expect(allOutput).not.toMatch(/(FRONTEND_URL|SP_BASE_URL) is required in production/);
  });

  it('development + neither set → no throw, dev defaults are fine', () => {
    process.env['NODE_ENV'] = 'development';
    expect(() => checkEnvironment()).not.toThrow();
    const fatalLines = consoleError.mock.calls.flat().join('\n');
    expect(fatalLines).not.toMatch(/required in production/);
  });
});
