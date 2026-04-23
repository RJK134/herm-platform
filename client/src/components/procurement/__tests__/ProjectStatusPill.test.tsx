import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectStatusPill } from '../ProjectStatusPill';

describe('<ProjectStatusPill />', () => {
  it('renders the published label for a canonical state', () => {
    render(<ProjectStatusPill status="shortlist_proposed" />);
    expect(
      screen.getByLabelText('Project status: Shortlist proposed'),
    ).toBeInTheDocument();
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
    expect(
      screen.getByLabelText('Project status: Archived'),
    ).toHaveAttribute(
      'title',
      'Project closed; no further actions expected.',
    );
  });

  it('accepts a custom tooltip', () => {
    render(<ProjectStatusPill status="draft" title="Your custom tooltip" />);
    expect(screen.getByLabelText('Project status: Draft')).toHaveAttribute(
      'title',
      'Your custom tooltip',
    );
  });

  it('does not declare role="status" (avoids noisy live-region announcements)', () => {
    render(<ProjectStatusPill status="draft" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
