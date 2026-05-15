import { describe, it, expect } from 'vitest';
import { PRODUCT } from '../lib/branding';

// Phase 16.1 — FHE rebrand guard. Locks the rebrand from the interim
// "FH Procure" (Phase 15.1) to the final "FHE Procurement Platform"
// against silent regressions. If a future PR reverts the product name,
// this test fails before downstream surfaces (PDF cover, OpenAPI title,
// email footer, login hero, sidebar, OTP issuer, etc.) drift back.
//
// Three assertions:
//   1. Short name pins to "FHE Procurement Platform" — the everyday
//      product identity used in chrome.
//   2. Long name pins to "Future Horizons System Procurement Platform"
//      — the form used in PDF covers, OpenAPI metadata, login hero,
//      and any place an enterprise procurement reviewer needs the
//      full vendor identity at a glance.
//   3. Vendor stays "Future Horizons Education" (the legal entity is
//      stable across product-name iterations).
describe('PRODUCT branding (Phase 16.1)', () => {
  it('uses "FHE Procurement Platform" as the short product name', () => {
    expect(PRODUCT.name).toBe('FHE Procurement Platform');
  });

  it('uses "Future Horizons System Procurement Platform" as the long name', () => {
    expect(PRODUCT.longName).toBe('Future Horizons System Procurement Platform');
    expect(PRODUCT.longName).toContain('Future Horizons');
    expect(PRODUCT.longName).toContain('Procurement Platform');
  });

  it('keeps the vendor identity stable as "Future Horizons Education"', () => {
    // Vendor is the legal entity; product is the offering. The rebrand
    // moved the product name but the vendor remains FHE — invoices,
    // licence headers, and Trust Centre legal copy reference the vendor.
    expect(PRODUCT.vendor).toBe('Future Horizons Education');
  });

  it('exposes a stable support email', () => {
    expect(PRODUCT.supportEmail).toMatch(/^support@/);
  });
});
