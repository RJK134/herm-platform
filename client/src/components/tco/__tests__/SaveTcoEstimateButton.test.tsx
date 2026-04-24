import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SaveTcoEstimateButton } from '../SaveTcoEstimateButton';
import type { TcoSavePayload } from '../SaveTcoEstimateButton';
import type { AuthUser } from '../../../contexts/AuthContext';

// ── Auth mock ─────────────────────────────────────────────────────────────
const mockAuth = vi.hoisted(() => ({
  user: null as AuthUser | null,
  isLoading: false,
  isAuthenticated: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  token: null as string | null,
}));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => mockAuth }));

// ── api mock ─────────────────────────────────────────────────────────────
// `vi.mock` is hoisted above imports, so its factory must not reference
// local `const`s — use `vi.hoisted` so the fn survives the hoist.
const mockSaveTcoEstimate = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/api', () => ({
  api: {
    saveTcoEstimate: mockSaveTcoEstimate,
  },
}));

function setAuthed(authed: boolean) {
  mockAuth.isAuthenticated = authed;
  mockAuth.user = authed
    ? ({
        userId: 'u-1',
        email: 'u@test.com',
        name: 'Alice',
        role: 'VIEWER',
        institutionId: 'inst-1',
        institutionName: 'Test Uni',
        tier: 'free',
      } as AuthUser)
    : null;
}

const basePayload: TcoSavePayload = {
  systemId: 'sys-1',
  institutionSize: 'medium',
  studentFte: 12000,
  staffFte: 0,
  horizonYears: 5,
  licenceCostYear1: 100,
  implementationCost: 500,
  internalStaffCost: 200,
  trainingCost: 0,
  infrastructureCost: 10,
  integrationCost: 0,
  supportCost: 20,
  customDevCost: 5,
  totalTco: 1000,
  annualRunRate: 200,
  perStudentCost: 8,
};

describe('<SaveTcoEstimateButton />', () => {
  beforeEach(() => {
    mockSaveTcoEstimate.mockReset();
    setAuthed(true);
  });

  it('disables the button when the user is not authenticated', () => {
    setAuthed(false);
    render(<SaveTcoEstimateButton payload={basePayload} />);
    const btn = screen.getByRole('button', { name: /save estimate/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Sign in to save estimates');
  });

  it('disables the button when there is no payload yet', () => {
    render(<SaveTcoEstimateButton payload={null} />);
    const btn = screen.getByRole('button', { name: /save estimate/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Run the calculator first');
  });

  it('opens the modal; Save is disabled until a name is entered', () => {
    render(<SaveTcoEstimateButton payload={basePayload} />);
    fireEvent.click(screen.getByRole('button', { name: /save estimate/i }));
    const nameInput = screen.getByLabelText(/estimate name/i);
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toBeDisabled();
    fireEvent.change(nameInput, { target: { value: '  ' } });
    expect(saveBtn).toBeDisabled(); // whitespace-only doesn't satisfy required
    fireEvent.change(nameInput, { target: { value: 'My estimate' } });
    expect(saveBtn).not.toBeDisabled();
  });

  it('POSTs the payload + name and shows the success state', async () => {
    mockSaveTcoEstimate.mockResolvedValueOnce({ data: { data: { id: 'tco-1' } } });
    render(<SaveTcoEstimateButton payload={basePayload} systemName="Workday" />);

    fireEvent.click(screen.getByRole('button', { name: /save estimate/i }));
    fireEvent.change(screen.getByLabelText(/estimate name/i), {
      target: { value: 'Workday 5yr' },
    });
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: 'assumes licence flat' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.getByText(/Your estimate is saved/i)).toBeInTheDocument(),
    );

    expect(mockSaveTcoEstimate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Workday 5yr',
        institutionSize: 'medium',
        horizonYears: 5,
        systemId: 'sys-1',
        notes: 'assumes licence flat',
        totalTco: 1000,
      }),
    );
    // createdById / institutionId are intentionally NOT sent — the
    // server stamps them from the JWT.
    const [body] = mockSaveTcoEstimate.mock.calls[0] ?? [];
    expect(body).not.toHaveProperty('createdById');
    expect(body).not.toHaveProperty('institutionId');
  });

  it('renders an error when the save request fails', async () => {
    mockSaveTcoEstimate.mockRejectedValueOnce(new Error('Network is down'));
    render(<SaveTcoEstimateButton payload={basePayload} />);
    fireEvent.click(screen.getByRole('button', { name: /save estimate/i }));
    fireEvent.change(screen.getByLabelText(/estimate name/i), {
      target: { value: 'failing save' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(screen.getByText(/Network is down/i)).toBeInTheDocument());
    // Success panel must NOT render on a failed save.
    expect(screen.queryByText(/Your estimate is saved/i)).not.toBeInTheDocument();
  });
});
