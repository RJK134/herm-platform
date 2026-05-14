import type { ReactElement } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';

const mockAuth = vi.hoisted(() => ({
  user: null as { role: string } | null,
  isLoading: false,
  isAuthenticated: false,
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

function renderWithRoute(initialEntries: string[], element: ReactElement) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/secret" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('redirects unauthenticated users to /login', () => {
    mockAuth.user = null;
    mockAuth.isLoading = false;
    mockAuth.isAuthenticated = false;

    renderWithRoute(
      ['/secret'],
      <ProtectedRoute>
        <div>Secret!</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Secret!')).not.toBeInTheDocument();
  });

  it('renders children for authenticated users', () => {
    mockAuth.user = { role: 'VIEWER' };
    mockAuth.isLoading = false;
    mockAuth.isAuthenticated = true;

    renderWithRoute(
      ['/secret'],
      <ProtectedRoute>
        <div>Secret!</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText('Secret!')).toBeInTheDocument();
  });

  it('shows access-restricted message when role does not match', () => {
    mockAuth.user = { role: 'VIEWER' };
    mockAuth.isLoading = false;
    mockAuth.isAuthenticated = true;

    renderWithRoute(
      ['/secret'],
      <ProtectedRoute roles={['SUPER_ADMIN']}>
        <div>Secret!</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText(/Access restricted/i)).toBeInTheDocument();
    expect(screen.queryByText('Secret!')).not.toBeInTheDocument();
  });
});
