import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImpersonationBanner } from '../ImpersonationBanner';
import type { AuthUser } from '../../contexts/AuthContext';

// Standard pattern from Sidebar.adminGate.test.tsx — hoist a mutable mock
// auth object and rebind the `useAuth` hook to return it.
const mockAuth = vi.hoisted(() => ({
  user: null as AuthUser | null,
  token: null as string | null,
  isLoading: false,
  isAuthenticated: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  endImpersonation: vi.fn(),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    userId: 'u1',
    email: 'customer@uni.test',
    name: 'Customer User',
    role: 'VIEWER',
    institutionId: 'inst-1',
    institutionName: 'Test University',
    tier: 'free',
    ...overrides,
  };
}

describe('<ImpersonationBanner />', () => {
  beforeEach(() => {
    mockAuth.user = null;
    mockAuth.endImpersonation = vi.fn();
  });

  it('renders nothing for an anonymous visitor', () => {
    const { container } = render(<ImpersonationBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a normal authenticated user (no impersonator claim)', () => {
    mockAuth.user = makeUser();
    const { container } = render(<ImpersonationBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the banner when the JWT carries an impersonator claim', () => {
    mockAuth.user = makeUser({
      impersonator: {
        userId: 'admin-1',
        email: 'support@futurehorizons.test',
        name: 'Support Engineer',
      },
    });
    render(<ImpersonationBanner />);

    const banner = screen.getByTestId('impersonation-banner');
    expect(banner).toBeInTheDocument();
    // role="status" gives a polite (non-interrupting) screen-reader
    // announcement, matching the persistent-state nature of the banner.
    expect(banner).toHaveAttribute('role', 'status');
    // Both customer and impersonator identity must be visible — the banner
    // only earns its keep if the engineer can see who they are pretending
    // to be AND who they really are.
    expect(banner).toHaveTextContent(/Customer User/);
    expect(banner).toHaveTextContent(/customer@uni\.test/);
    expect(banner).toHaveTextContent(/Support Engineer/);
    expect(screen.getByRole('button', { name: /End impersonation/i })).toBeInTheDocument();
  });

  it('calls endImpersonation when the End button is clicked', async () => {
    mockAuth.user = makeUser({
      impersonator: { userId: 'admin-1', email: 's@x.test', name: 'Admin' },
    });
    mockAuth.endImpersonation = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<ImpersonationBanner />);
    await user.click(screen.getByRole('button', { name: /End impersonation/i }));

    await waitFor(() => {
      expect(mockAuth.endImpersonation).toHaveBeenCalledTimes(1);
    });
  });

  it('shows a loading state while ending impersonation', async () => {
    mockAuth.user = makeUser({
      impersonator: { userId: 'admin-1', email: 's@x.test', name: 'Admin' },
    });
    let resolveEnd: () => void = () => {};
    mockAuth.endImpersonation = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveEnd = resolve;
        }),
    );
    const user = userEvent.setup();

    render(<ImpersonationBanner />);
    const button = screen.getByRole('button', { name: /End impersonation/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ending/i })).toBeDisabled();
    });

    // Cleanly resolve so React doesn't warn about leaked acts.
    resolveEnd();
  });

  it('resets the button state after a successful end so a second session is not stuck', async () => {
    // Bugbot-flagged regression: the banner stays mounted (returns null
    // when not impersonating) so its hooks state survives across
    // impersonation sessions. Without a finally-block reset, a successful
    // end leaves `isEnding=true` and the next session renders the button
    // disabled with "Ending…".
    mockAuth.user = makeUser({
      impersonator: { userId: 'admin-1', email: 's@x.test', name: 'Admin' },
    });
    mockAuth.endImpersonation = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    const { rerender } = render(<ImpersonationBanner />);
    await user.click(screen.getByRole('button', { name: /End impersonation/i }));

    // Simulate the new impersonation session re-mounting under the same
    // tree position by re-rendering with a fresh impersonator.
    await waitFor(() => {
      expect(mockAuth.endImpersonation).toHaveBeenCalledTimes(1);
    });

    mockAuth.user = makeUser({
      email: 'other@uni.test',
      name: 'Other User',
      impersonator: { userId: 'admin-1', email: 's@x.test', name: 'Admin' },
    });
    rerender(<ImpersonationBanner />);

    expect(
      screen.getByRole('button', { name: /End impersonation/i }),
    ).not.toBeDisabled();
  });

  it('keeps the button enabled if endImpersonation rejects so the user can retry', async () => {
    mockAuth.user = makeUser({
      impersonator: { userId: 'admin-1', email: 's@x.test', name: 'Admin' },
    });
    mockAuth.endImpersonation = vi
      .fn()
      .mockRejectedValue(new Error('network'));
    const user = userEvent.setup();

    render(<ImpersonationBanner />);
    await user.click(screen.getByRole('button', { name: /End impersonation/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /End impersonation/i }),
      ).not.toBeDisabled();
    });
  });
});
