import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Wordmark } from '../Wordmark';

// Phase 16.3 — Wordmark contract test.
//
// Pins the brand-lockup invariants:
//   - Renders the literal "FHE Procurement Platform" text (the
//     wordmark IS the brand; it doesn't read from PRODUCT.name).
//   - Includes the FHE mark image with the right src.
//   - Variant + height props produce the right layout / sizing.
//   - aria-label exposes the lockup as a single accessible name.

describe('<Wordmark />', () => {
  it('renders the literal "FHE Procurement Platform" text', () => {
    render(<Wordmark />);
    expect(screen.getByText('FHE Procurement Platform')).toBeInTheDocument();
  });

  it('exposes the lockup via aria-label', () => {
    render(<Wordmark />);
    expect(screen.getByLabelText('FHE Procurement Platform')).toBeInTheDocument();
  });

  it('renders the FHE mark image at /fhe-mark.svg', () => {
    const { container } = render(<Wordmark height={48} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/fhe-mark.svg');
    expect(img?.getAttribute('width')).toBe('48');
    expect(img?.getAttribute('height')).toBe('48');
  });

  it('switches layout for stacked variant', () => {
    const { container: inline } = render(<Wordmark variant="inline" />);
    const { container: stacked } = render(<Wordmark variant="stacked" />);
    // The root span carries the layout class; check the difference.
    expect(inline.firstChild).toHaveClass('items-center');
    expect(stacked.firstChild).toHaveClass('flex-col');
  });

  it('forwards className for tier-accent skinning', () => {
    const { container } = render(<Wordmark className="tier-accent-text" />);
    expect(container.firstChild).toHaveClass('tier-accent-text');
  });
});
