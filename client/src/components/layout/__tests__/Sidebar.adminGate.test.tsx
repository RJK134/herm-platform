import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../Sidebar';
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

vi.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('../../../contexts/SidebarContext', () => ({
  useSidebar: () => ({
    isCollapsed: false,
    isMobileOpen: false,
    toggleCollapse: vi.fn(),
    closeMobile: vi.fn(),
    openMobile: vi.fn(),
  }),
}));

vi.mock('../../../contexts/FrameworkContext', () => ({
  useFramework: () => ({
    frameworks: [],
    activeFramework: null,
    setActiveFramework: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('../../NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('../../LanguageSelector', () => ({ LanguageSelector: () => null }));

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

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('<Sidebar /> — role-gated Admin section', () => {
  beforeEach(() => {
    setUser(null);
    mockAuth.isLoading = false;
  });

  it('hides the Admin section for an anonymous visitor', () => {
    renderSidebar();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Systems Management')).not.toBeInTheDocument();
    expect(screen.queryByText('Vendor Management')).not.toBeInTheDocument();
  });

  it('hides the Admin section for an authenticated VIEWER', () => {
    setUser(makeUser({ role: 'VIEWER' }));
    renderSidebar();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Systems Management')).not.toBeInTheDocument();
  });

  it('hides the Admin section for an authenticated PROCUREMENT_LEAD', () => {
    setUser(makeUser({ role: 'PROCUREMENT_LEAD', tier: 'professional' }));
    renderSidebar();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('shows the Admin section for INSTITUTION_ADMIN', () => {
    setUser(makeUser({ role: 'INSTITUTION_ADMIN' }));
    renderSidebar();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Systems Management')).toBeInTheDocument();
    expect(screen.getByText('Vendor Management')).toBeInTheDocument();
  });

  it('shows the Admin section for SUPER_ADMIN regardless of tier', () => {
    setUser(makeUser({ role: 'SUPER_ADMIN', tier: 'free' }));
    renderSidebar();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Systems Management')).toBeInTheDocument();
  });
});
