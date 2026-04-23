import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectStatusPill } from '../ProjectStatusPill';

describe('<ProjectStatusPill />', () => {
  it('renders the published label for a canonical state', () => {
    render(<ProjectStatusPill status="shortlist_proposed" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Project status: Shortlist proposed',
    );
    expect(screen.getByText('Shortlist proposed')).toBeInTheDocument();
  });

  it('normalises legacy active → active_review', () => {
    render(<ProjectStatusPill status="active" />);
    expect(screen.getByText('Active review')).toBeInTheDocument();
  });

  it('falls back to Draft on unknown / null', () => {
    const { rerender } = render(<ProjectStatusPill status={null} />);
    expect(screen.getByText('Draft')).toBeInTheDocument();

    rerender(<ProjectStatusPill status="made_up_status" />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('uses the state description as the default tooltip', () => {
    render(<ProjectStatusPill status="archived" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'title',
      'Project closed; no further actions expected.',
    );
  });

  it('accepts a custom tooltip', () => {
    render(<ProjectStatusPill status="draft" title="Your custom tooltip" />);
    expect(screen.getByRole('status')).toHaveAttribute('title', 'Your custom tooltip');
  });
});
