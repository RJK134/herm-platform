import type { ReactElement } from 'react';

interface WordmarkProps {
  /**
   * Pixel height for the lockup. Width scales proportionally. Defaults
   * to 32 (sidebar / topbar treatment); 56 is the standard login-hero
   * size.
   */
  height?: number;
  /**
   * `inline` renders mark + text side-by-side (sidebar, topbar).
   * `stacked` puts the mark above the text (centred login hero).
   * Defaults to `inline`.
   */
  variant?: 'inline' | 'stacked';
  /**
   * Optional className applied to the root span — useful for adding
   * tier-accent text colour (`tier-accent-text`) or custom margins.
   */
  className?: string;
}

/**
 * Phase 16.3 — FHE Procurement Platform wordmark.
 *
 * The brand mark (striped globe at `/fhe-mark.svg`) + the wordmark text
 * "FHE Procurement Platform" rendered in DM Sans. Single component so
 * every chrome surface (sidebar, login hero, PDF cover preview, About
 * page) renders the same lockup.
 *
 * Why hardcode the wordmark text rather than read `PRODUCT.name`: a
 * brand mark IS the brand. If the product name changes again the
 * wordmark needs a redesign, not a string swap. The `PRODUCT.name`
 * constant remains the source of truth for chrome text labels (sidebar
 * footer, browser tab); the wordmark lockup is a deliberate fixed
 * artefact.
 *
 * The text uses `currentColor` so callers can apply
 * `tier-accent-text` / `text-brand-ink` / `text-brand-cream` to retint
 * the lockup without modifying this component. The mark's stripes are
 * baked into the SVG (intentionally — the FHE colour palette IS the
 * mark identity).
 */
export function Wordmark({ height = 32, variant = 'inline', className = '' }: WordmarkProps): ReactElement {
  const markSize = height;
  const textSize = Math.round(height * 0.5);

  const layout = variant === 'inline'
    ? 'inline-flex items-center gap-2.5'
    : 'inline-flex flex-col items-center gap-2';

  return (
    <span className={`${layout} ${className}`} aria-label="FHE Procurement Platform">
      <img
        src="/fhe-mark.svg"
        alt=""
        width={markSize}
        height={markSize}
        className="block flex-shrink-0"
      />
      <span
        className="font-display font-bold tracking-tight whitespace-nowrap"
        style={{ fontSize: `${textSize}px`, lineHeight: 1.05 }}
      >
        FHE Procurement Platform
      </span>
    </span>
  );
}
