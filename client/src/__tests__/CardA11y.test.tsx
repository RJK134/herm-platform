import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Card } from '../components/ui/Card';

// Phase 14.5a — pin the WCAG-relevant behaviour of the Card component:
//   1. With onClick, render as <button> so it's keyboard-reachable
//      (Tab + Enter/Space) and gets the implicit `role="button"` for
//      assistive tech. Pre-14.5a this was a click-bearing <div> that
//      silently failed WCAG 2.1.1.
//   2. Without onClick, stay as a layout <div> (otherwise every Card
//      becomes a screen-reader landmark, polluting the AT outline).
//   3. Optional `ariaLabel` for clickable cards is forwarded through
//      so the button has an accessible name.

describe('<Card /> — WCAG 14.5a', () => {
  it('renders a <button> when onClick is provided', () => {
    render(<Card onClick={() => undefined}>Click me</Card>);
    const btn = screen.getByRole('button', { name: 'Click me' });
    expect(btn.tagName).toBe('BUTTON');
  });

  it('renders a layout <div> (no role) when onClick is omitted', () => {
    render(<Card>Static content</Card>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Static content').tagName).toBe('DIV');
  });

  it('forwards ariaLabel as the accessible name on a clickable card', () => {
    render(
      <Card onClick={() => undefined} ariaLabel="Open SITS:Vision details">
        SITS:Vision
      </Card>,
    );
    expect(
      screen.getByRole('button', { name: 'Open SITS:Vision details' }),
    ).toBeInTheDocument();
  });

  it('fires onClick on Enter/Space (keyboard activation)', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Card onClick={onClick}>Press me</Card>);
    const btn = screen.getByRole('button', { name: 'Press me' });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
