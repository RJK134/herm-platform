import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Login } from '../pages/Login';
import { PRODUCT } from '../lib/branding';

const mockLogin = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => ({
  user: null as { role: string } | null,
  isLoading: false,
  isAuthenticated: false,
  login: mockLogin,
  register: vi.fn(),
  logout: vi.fn(),
  token: null,
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

function renderLoginAt(initialUrl: string) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<div>Landed: {window.location.pathname}</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Login — post-login redirect safety', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockLogin.mockResolvedValue(undefined);
  });

  it('renders the Future Horizons ASPT product branding', () => {
    renderLoginAt('/login');

    expect(
      screen.getByRole('heading', { name: PRODUCT.name, level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/UCISA HERM v3\.1 Procurement Intelligence/i),
    ).toBeInTheDocument();
  });

  it('uses ?returnTo when it is a safe internal path', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderLoginAt('/login?returnTo=%2Fassistant');

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('a@b.co', 'pw'));
  });

  it('rejects protocol-relative returnTo (//evil.com)', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderLoginAt('/login?returnTo=%2F%2Fevil.com');

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    // No "Login failed" error banner should appear — validation should have
    // coerced the unsafe path to '/' and navigate should not throw.
    expect(screen.queryByText(/failed|error/i)).not.toBeInTheDocument();
  });

  it('rejects absolute URL returnTo (https://evil.com)', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderLoginAt('/login?returnTo=https%3A%2F%2Fevil.com');

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    expect(screen.queryByText(/failed|error/i)).not.toBeInTheDocument();
  });
});
