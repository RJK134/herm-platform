import { describe, it, expect } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UpgradeCard } from '../UpgradeCard';

function renderCard(node: ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('<UpgradeCard />', () => {
  it('shows the feature name and required tier', () => {
    renderCard(
      <UpgradeCard
        requiredTiers={['enterprise']}
        featureName="API Integration"
      />,
    );
    expect(screen.getByText('API Integration')).toBeInTheDocument();
    expect(screen.getByText('Enterprise')).toBeInTheDocument();
  });

  it('links to /subscription by default', () => {
    renderCard(
      <UpgradeCard
        requiredTiers={['professional', 'enterprise']}
        featureName="Sector Intelligence"
      />,
    );
    const link = screen.getByRole('link', { name: /Compare plans/ });
    expect(link).toHaveAttribute('href', '/subscription');
  });

  it('honours a custom upgrade href', () => {
    renderCard(
      <UpgradeCard
        requiredTiers={['enterprise']}
        featureName="Framework Mapping"
        upgradeHref="/pricing"
      />,
    );
    const link = screen.getByRole('link', { name: /Compare plans/ });
    expect(link).toHaveAttribute('href', '/pricing');
  });

  it('uses the provided description when given', () => {
    renderCard(
      <UpgradeCard
        requiredTiers={['enterprise']}
        featureName="API Integration"
        description="Custom description for enterprise API keys."
      />,
    );
    expect(screen.getByText('Custom description for enterprise API keys.')).toBeInTheDocument();
  });

  it('never implies HERM content itself is paid', () => {
    renderCard(
      <UpgradeCard
        requiredTiers={['enterprise']}
        featureName="Framework Mapping"
      />,
    );
    // The disclaimer line below the CTA is the compliance guardrail.
    // If this test breaks, either the copy was reworded (fine, update
    // the matcher) or — worse — the disclaimer was removed entirely.
    // Use a regex matcher directly to scope the hit without matching
    // every ancestor that happens to contain the phrase.
    const hits = screen.getAllByText(/HERM reference model is unaffected/i);
    expect(hits.length).toBeGreaterThan(0);
  });
});
