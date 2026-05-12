import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireTier } from '../RequireTier';
import type { AuthUser } from '../../../contexts/AuthContext';

const mockAuth = vi.hoisted(() => ({
  user: null as AuthUser | null,
  isLoading: false,
  isAuthenticated: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  token: null as string | null,
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

function setUser(user: AuthUser | null) {
  mockAuth.user = user;
  mockAuth.isAuthenticated = user !== null;
  mockAuth.token = user ? 'tok' : null;
}

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    userId: 'u1',
    email: 'u@test.com',
    name: 'Test User',
    role: 'VIEWER',
    institutionId: 'inst1',
    institutionName: 'Test Uni',
    tier: 'free',
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/paid"
          element={
            <RequireTier
              tiers={['pro', 'enterprise']}
              featureName="Sector Intelligence"
              description="Paid analytics feature"
            >
              <div>PAID CONTENT</div>
            </RequireTier>
          }
        />
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<RequireTier />', () => {
  beforeEach(() => {
    setUser(null);
    mockAuth.isLoading = false;
  });

  it('redirects anonymous users to /login with returnTo preserved', () => {
    renderAt('/paid?source=banner');
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
    expect(screen.queryByText('PAID CONTENT')).not.toBeInTheDocument();
  });

  it('renders the upgrade card for a free-tier authenticated user', () => {
    setUser(makeUser({ tier: 'free' }));
    renderAt('/paid');
    expect(screen.queryByText('PAID CONTENT')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Sector Intelligence/ })).toBeInTheDocument();
    expect(screen.getByText('Paid analytics feature')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Compare plans/ })).toHaveAttribute('href', '/subscription');
  });

  it('lets pro-tier users through when listed', () => {
    setUser(makeUser({ tier: 'pro' }));
    renderAt('/paid');
    expect(screen.getByText('PAID CONTENT')).toBeInTheDocument();
  });

  it('lets enterprise-tier users through when listed', () => {
    setUser(makeUser({ tier: 'enterprise' }));
    renderAt('/paid');
    expect(screen.getByText('PAID CONTENT')).toBeInTheDocument();
  });

  it('bypasses the gate for SUPER_ADMIN on any tier', () => {
    setUser(makeUser({ role: 'SUPER_ADMIN', tier: 'free' }));
    renderAt('/paid');
    expect(screen.getByText('PAID CONTENT')).toBeInTheDocument();
  });

  it('renders nothing while auth is loading', () => {
    mockAuth.isLoading = true;
    const { container } = renderAt('/paid');
    expect(container.textContent).not.toContain('PAID CONTENT');
    expect(container.textContent).not.toContain('LOGIN PAGE');
  });

  it('shows the upgrade card if the user is listed on a stricter gate they do not meet', () => {
    setUser(makeUser({ tier: 'pro' }));
    render(
      <MemoryRouter initialEntries={['/ent']}>
        <Routes>
          <Route
            path="/ent"
            element={
              <RequireTier tiers={['enterprise']} featureName="Framework Mapping">
                <div>ENT CONTENT</div>
              </RequireTier>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText('ENT CONTENT')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Framework Mapping/ })).toBeInTheDocument();
  });
});
