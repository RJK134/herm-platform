import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShortlistDecisionBadge } from '../ShortlistDecisionBadge';

describe('<ShortlistDecisionBadge />', () => {
  it('shows Pending for missing/null/unknown decisionStatus', () => {
    render(<ShortlistDecisionBadge decisionStatus={null} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByLabelText('Shortlist decision: Pending')).toHaveAttribute(
      'title',
      'Awaiting decision',
    );
  });

  it('shows Approved with rationale, reviewer, and date in the tooltip', () => {
    render(
      <ShortlistDecisionBadge
        decisionStatus="approved"
        rationale="Best HERM coverage overall"
        decidedBy="Alice"
        decidedAt="2026-03-15T00:00:00Z"
      />,
    );
    expect(screen.getByText('Approved')).toBeInTheDocument();
    const title =
      screen.getByLabelText('Shortlist decision: Approved').getAttribute('title') ?? '';
    expect(title).toContain('Best HERM coverage overall');
    expect(title).toContain('Alice');
    // en-GB locale → DD/MM/YYYY; just check the date digits appear.
    expect(title).toMatch(/15\/0?3\/2026/);
  });

  it('shows Rejected with rationale', () => {
    render(<ShortlistDecisionBadge decisionStatus="rejected" rationale="Missing SSO" />);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByLabelText('Shortlist decision: Rejected')).toHaveAttribute(
      'title',
      'Missing SSO',
    );
  });

  it('flags a decided-but-unrationale entry distinctly', () => {
    render(<ShortlistDecisionBadge decisionStatus="approved" />);
    expect(screen.getByLabelText('Shortlist decision: Approved')).toHaveAttribute(
      'title',
      'Approved — no rationale recorded',
    );
  });

  it('does not declare role="status" (avoids noisy live-region announcements)', () => {
    render(<ShortlistDecisionBadge decisionStatus="approved" rationale="x" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
