import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecuritySettings } from '../pages/SecuritySettings';

// Stub the api surface — the page is a state machine over four endpoints
// (status, enroll, verify, disable) so unit-level tests should pin the
// transitions, not the HTTP layer.
const apiMock = vi.hoisted(() => ({
  getMfaStatus: vi.fn(),
  enrollMfa: vi.fn(),
  verifyMfa: vi.fn(),
  disableMfa: vi.fn(),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: apiMock,
  };
});

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function statusResponse(status: { enrolled: boolean; enabled: boolean; enabledAt: string | null }) {
  return { data: { success: true, data: status } };
}

describe('<SecuritySettings />', () => {
  it('shows the Enable button when MFA is not yet active', async () => {
    apiMock.getMfaStatus.mockResolvedValue(
      statusResponse({ enrolled: false, enabled: false, enabledAt: null }),
    );

    render(<SecuritySettings />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Enable two-factor authentication/i }),
      ).toBeInTheDocument();
    });
  });

  it('renders the secret + verify form after enrol', async () => {
    apiMock.getMfaStatus.mockResolvedValue(
      statusResponse({ enrolled: false, enabled: false, enabledAt: null }),
    );
    apiMock.enrollMfa.mockResolvedValue({
      data: {
        success: true,
        data: {
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri:
            'otpauth://totp/Future%20Horizons%20ASPT:u%40test.com?secret=JBSWY3DPEHPK3PXP&issuer=Future%20Horizons%20ASPT',
        },
      },
    });
    const user = userEvent.setup();

    render(<SecuritySettings />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Enable two-factor authentication/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Enable two-factor authentication/i }));

    await waitFor(() => {
      expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
      expect(screen.getByLabelText(/Authentication code/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Verify and activate/i })).toBeInTheDocument();
    });
  });

  it('verifies a 6-digit code and refreshes status', async () => {
    apiMock.getMfaStatus.mockResolvedValueOnce(
      statusResponse({ enrolled: false, enabled: false, enabledAt: null }),
    );
    apiMock.enrollMfa.mockResolvedValue({
      data: {
        success: true,
        data: { secret: 'AAAA', otpauthUri: 'otpauth://totp/x?secret=AAAA' },
      },
    });
    apiMock.verifyMfa.mockResolvedValue({
      data: { success: true, data: { enabledAt: '2026-04-30T12:00:00Z' } },
    });
    apiMock.getMfaStatus.mockResolvedValueOnce(
      statusResponse({ enrolled: true, enabled: true, enabledAt: '2026-04-30T12:00:00Z' }),
    );
    const user = userEvent.setup();

    render(<SecuritySettings />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Enable two-factor authentication/i }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Enable two-factor authentication/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Authentication code/i)).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/Authentication code/i), '123456');
    await user.click(screen.getByRole('button', { name: /Verify and activate/i }));

    await waitFor(() => {
      expect(apiMock.verifyMfa).toHaveBeenCalledWith('123456');
    });
    // The page transitions to the active state after refresh.
    await waitFor(() => {
      expect(screen.getByText(/Active since/i)).toBeInTheDocument();
    });
  });

  it('shows the disable form when MFA is already active', async () => {
    apiMock.getMfaStatus.mockResolvedValue(
      statusResponse({ enrolled: true, enabled: true, enabledAt: '2026-04-29T00:00:00Z' }),
    );

    render(<SecuritySettings />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Disable two-factor authentication/i }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Enable two-factor/i })).not.toBeInTheDocument();
  });

  it('rejects an enabled disable button until 6 digits are typed', async () => {
    apiMock.getMfaStatus.mockResolvedValue(
      statusResponse({ enrolled: true, enabled: true, enabledAt: '2026-04-29T00:00:00Z' }),
    );
    const user = userEvent.setup();

    render(<SecuritySettings />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Disable two-factor authentication/i }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: /Disable two-factor authentication/i }),
    ).toBeDisabled();

    await user.type(screen.getByLabelText(/Authentication code/i), '12345');
    expect(
      screen.getByRole('button', { name: /Disable two-factor authentication/i }),
    ).toBeDisabled();

    await user.type(screen.getByLabelText(/Authentication code/i), '6');
    expect(
      screen.getByRole('button', { name: /Disable two-factor authentication/i }),
    ).not.toBeDisabled();
  });

  it('surfaces an API error toast when verify fails', async () => {
    const toast = (await import('react-hot-toast')).default;
    apiMock.getMfaStatus.mockResolvedValue(
      statusResponse({ enrolled: false, enabled: false, enabledAt: null }),
    );
    apiMock.enrollMfa.mockResolvedValue({
      data: { success: true, data: { secret: 'AAAA', otpauthUri: 'otpauth://totp/x?secret=AAAA' } },
    });
    const { ApiError } = await import('../lib/api');
    apiMock.verifyMfa.mockRejectedValue(new ApiError(401, 'AUTHENTICATION_ERROR', 'Invalid authentication code'));
    const user = userEvent.setup();

    render(<SecuritySettings />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Enable two-factor authentication/i }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Enable two-factor authentication/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/Authentication code/i)).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/Authentication code/i), '111111');
    await user.click(screen.getByRole('button', { name: /Verify and activate/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Invalid authentication code');
    });
  });
});
