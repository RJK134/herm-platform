import { describe, it, expect } from 'vitest';
import { PRODUCT } from '../lib/branding';

// Phase 15.1 — branding guard. Locks the rebrand from "Future Horizons
// ASPT" → "FH Procure" against silent regressions. If a future PR
// reverts the product name in branding.ts, this test fails before any
// of the 19 downstream user-visible surfaces (PDF cover, OpenAPI title,
// email footer, login hero, sidebar, OTP issuer, etc.) drift back.
//
// Two assertions:
//   1. Short name pins to "FH Procure" — the headline product identity.
//   2. Long name contains "Procurement Suite" — the form used in PDF
//      covers and OpenAPI metadata where the cryptic acronym would
//      confuse procurement reviewers.
describe('PRODUCT branding (Phase 15.1)', () => {
  it('uses "FH Procure" as the short product name', () => {
    expect(PRODUCT.name).toBe('FH Procure');
  });

  it('uses "Future Horizons Procurement Suite" in the long name', () => {
    expect(PRODUCT.longName).toContain('Procurement Suite');
    expect(PRODUCT.longName).toBe('Future Horizons Procurement Suite');
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
