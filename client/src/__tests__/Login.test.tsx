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
  loginMfa: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  endImpersonation: vi.fn(),
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
    // login returns a discriminated union; the password-only happy path
    // is `{ type: 'success' }`. AuthProvider has already updated state.
    mockLogin.mockResolvedValue({ type: 'success' });
  });

  it('renders the FHE Procurement Platform branding with HERM as a footnote', () => {
    renderLoginAt('/login');

    expect(
      screen.getByRole('heading', { name: PRODUCT.name, level: 1 }),
    ).toBeInTheDocument();
    // Phase 16.1: HERM moved from headline ("UCISA HERM v3.1 Procurement
    // Intelligence") to a tier-positioning footnote so the product
    // identity reads as FHE first, HERM as the included reference.
    expect(
      screen.getByText(/Procurement intelligence for higher education/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Includes UCISA HERM v3\.1.*free at every tier/i),
    ).toBeInTheDocument();
  });

  it('uses ?returnTo when it is a safe internal path', async () => {
    mockLogin.mockResolvedValueOnce({ type: 'success' });
    renderLoginAt('/login?returnTo=%2Fassistant');

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('a@b.co', 'pw'));
  });

  it('renders the current product name', () => {
    renderLoginAt('/login');

    expect(screen.getByRole('heading', { name: PRODUCT.name })).toBeInTheDocument();
  });

  it('rejects protocol-relative returnTo (//evil.com)', async () => {
    mockLogin.mockResolvedValueOnce({ type: 'success' });
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
    mockLogin.mockResolvedValueOnce({ type: 'success' });
    renderLoginAt('/login?returnTo=https%3A%2F%2Fevil.com');

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    expect(screen.queryByText(/failed|error/i)).not.toBeInTheDocument();
  });
});

describe('Login — MFA challenge step (Phase 10.8)', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockAuth.loginMfa.mockReset();
  });

  it('switches to the TOTP form when the password step returns mfa_required', async () => {
    mockLogin.mockResolvedValueOnce({
      type: 'mfa_required',
      challengeToken: 'challenge-abc',
    });
    renderLoginAt('/login');

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // The heading + form swap to the TOTP step.
    await screen.findByRole('heading', { name: /Two-factor authentication/i });
    expect(screen.getByLabelText(/Authentication code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Verify and sign in/i })).toBeInTheDocument();
  });

  it('submits the TOTP code with the challenge token', async () => {
    mockLogin.mockResolvedValueOnce({
      type: 'mfa_required',
      challengeToken: 'challenge-abc',
    });
    mockAuth.loginMfa.mockResolvedValueOnce(undefined);
    renderLoginAt('/login');

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    const codeInput = await screen.findByLabelText(/Authentication code/i);
    fireEvent.change(codeInput, { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify and sign in/i }));

    await waitFor(() =>
      expect(mockAuth.loginMfa).toHaveBeenCalledWith('challenge-abc', '654321'),
    );
  });

  it('returns to the password form when Cancel is clicked', async () => {
    mockLogin.mockResolvedValueOnce({
      type: 'mfa_required',
      challengeToken: 'challenge-abc',
    });
    renderLoginAt('/login');

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await screen.findByRole('button', { name: /Verify and sign in/i });
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Verify and sign in/i }),
    ).not.toBeInTheDocument();
  });
});
