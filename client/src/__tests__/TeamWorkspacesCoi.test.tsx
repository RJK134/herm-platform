import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import { TeamWorkspaces } from '../pages/TeamWorkspaces';

// Phase 14.9b — exercise the CoI tab + scoring gate. Stubs both raw `axios`
// (existing TeamWorkspaces queries are written against axios directly) and
// the new `api` helpers from `lib/api`. Coverage:
//   1. CoI tab renders the form when no declaration exists
//   2. Submitting the form invalidates the query and the form switches to
//      the "declaration recorded" view
//   3. Domain Assignment shows the gate banner + disables "Enter Scores"
//      until a declaration is recorded
//   4. Once declared, the Domain Assignment gate banner is gone

const apiMock = vi.hoisted(() => ({
  getMyCoi: vi.fn(),
  submitCoi: vi.fn(),
  listProjectCoi: vi.fn(),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: { ...actual.api, ...apiMock },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

function projectFixture() {
  return {
    id: 'demo-evaluation-001',
    name: 'SIS Replacement 2026',
    status: 'in_progress',
    leadUserId: 'user-lead',
    createdAt: '2026-05-01T00:00:00Z',
    systems: [
      { id: 'es-1', systemId: 'sys-1', system: { id: 'sys-1', name: 'SITS', vendor: 'Tribal' } },
    ],
    members: [
      {
        id: 'mem-1',
        userId: 'user-eval',
        role: 'evaluator',
        user: { id: 'user-eval', name: 'Alex Evaluator', email: 'alex@uni.ac.uk' },
        assignedDomains: [],
      },
    ],
    domainAssignments: [
      {
        id: 'da-1',
        domainId: 'dom-1',
        domain: { code: 'L&T', name: 'Learning & Teaching' },
        assignedToId: 'user-eval',
        assignedTo: { name: 'Alex Evaluator', email: 'alex@uni.ac.uk' },
        status: 'IN_PROGRESS',
      },
    ],
  };
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TeamWorkspaces />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let axiosGetSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  axiosGetSpy = vi.spyOn(axios, 'get').mockImplementation(((url: string) => {
    if (url === '/api/evaluations') {
      return Promise.resolve({ data: { success: true, data: [projectFixture()] } });
    }
    if (url === '/api/evaluations/demo-evaluation-001') {
      return Promise.resolve({ data: { success: true, data: projectFixture() } });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  }) as never);
});

afterEach(() => {
  axiosGetSpy.mockRestore();
});

describe('<TeamWorkspaces /> — CoI surface', () => {
  it('renders the CoI form when the evaluator has not yet declared', async () => {
    apiMock.getMyCoi.mockResolvedValue({ data: { success: true, data: null } });
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('SIS Replacement 2026')).toBeInTheDocument();
    });
    await user.click(screen.getByText('SIS Replacement 2026'));

    await user.click(screen.getByRole('button', { name: 'Conflict of Interest' }));

    expect(
      await screen.findByLabelText(/Declared interests/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Submit declaration/i }),
    ).toBeInTheDocument();
  });

  it('submits the declaration and switches to the recorded view', async () => {
    apiMock.getMyCoi
      .mockResolvedValueOnce({ data: { success: true, data: null } })
      .mockResolvedValue({
        data: {
          success: true,
          data: {
            id: 'coi-1',
            evaluationProjectId: 'demo-evaluation-001',
            userId: 'user-eval',
            declaredText: 'Consulted for Vendor X in 2021.',
            declaredHash: 'abc',
            signedAt: '2026-05-10T08:30:00Z',
          },
        },
      });
    apiMock.submitCoi.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 'coi-1',
          evaluationProjectId: 'demo-evaluation-001',
          userId: 'user-eval',
          declaredText: 'Consulted for Vendor X in 2021.',
          declaredHash: 'abc',
          signedAt: '2026-05-10T08:30:00Z',
        },
      },
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('SIS Replacement 2026')).toBeInTheDocument();
    });
    await user.click(screen.getByText('SIS Replacement 2026'));
    await user.click(screen.getByRole('button', { name: 'Conflict of Interest' }));

    const textarea = await screen.findByLabelText(/Declared interests/i);
    await user.type(textarea, 'Consulted for Vendor X in 2021.');
    await user.click(screen.getByRole('button', { name: /Submit declaration/i }));

    await waitFor(() => {
      expect(apiMock.submitCoi).toHaveBeenCalledWith(
        'demo-evaluation-001',
        'Consulted for Vendor X in 2021.',
      );
    });

    expect(
      await screen.findByText(/Declaration recorded/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Consulted for Vendor X in 2021.'),
    ).toBeInTheDocument();
  });

  it('blocks Enter Scores on Domain Assignment until CoI is declared', async () => {
    apiMock.getMyCoi.mockResolvedValue({ data: { success: true, data: null } });
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('SIS Replacement 2026')).toBeInTheDocument();
    });
    await user.click(screen.getByText('SIS Replacement 2026'));

    expect(
      await screen.findByText(/Conflict of Interest declaration required/i),
    ).toBeInTheDocument();

    const enterScores = screen.getByRole('button', { name: /Enter Scores/i });
    expect(enterScores).toBeDisabled();
  });

  it('removes the gate banner once a declaration exists', async () => {
    apiMock.getMyCoi.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 'coi-1',
          evaluationProjectId: 'demo-evaluation-001',
          userId: 'user-eval',
          declaredText: '',
          declaredHash: 'abc',
          signedAt: '2026-05-10T08:30:00Z',
        },
      },
    });
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('SIS Replacement 2026')).toBeInTheDocument();
    });
    await user.click(screen.getByText('SIS Replacement 2026'));

    await screen.findByRole('button', { name: /Auto-assign/i });
    expect(
      screen.queryByText(/Conflict of Interest declaration required/i),
    ).not.toBeInTheDocument();
    const enterScores = screen.getByRole('button', { name: /Enter Scores/i });
    expect(enterScores).not.toBeDisabled();
  });
});
