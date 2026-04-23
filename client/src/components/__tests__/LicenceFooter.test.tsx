import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LicenceFooter } from '../LicenceFooter';

// We stub `useFramework` directly — the footer is a pure projection of the
// active framework. There is no need to spin up the full FrameworkProvider
// (which fetches from `/api/frameworks`) just to render a banner.
vi.mock('../../contexts/FrameworkContext', () => ({
  useFramework: vi.fn(),
}));
import { useFramework } from '../../contexts/FrameworkContext';

describe('<LicenceFooter />', () => {
  it('renders attribution for a CC-licensed framework', () => {
    vi.mocked(useFramework).mockReturnValue({
      frameworks: [],
      activeFramework: {
        id: 'fw-1',
        slug: 'herm-v3.1',
        name: 'UCISA HERM v3.1',
        version: '3.1',
        publisher: 'CAUDIT',
        licenceType: 'CC-BY-NC-SA-4.0',
        licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
        licenceNotice: null,
        isPublic: true,
        isDefault: false,
        domainCount: 11,
        capabilityCount: 165,
      },
      setActiveFramework: vi.fn(),
      isLoading: false,
    });

    render(<LicenceFooter />);
    expect(screen.getByText(/UCISA HERM v3.1/)).toBeInTheDocument();
    expect(screen.getByText(/CAUDIT/)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    );
  });

  it('renders nothing for a proprietary framework', () => {
    vi.mocked(useFramework).mockReturnValue({
      frameworks: [],
      activeFramework: {
        id: 'fw-2',
        slug: 'fhe-capability-framework',
        name: 'FHE Capability Framework',
        version: '1.0',
        publisher: 'Future Horizons Education',
        licenceType: 'PROPRIETARY',
        licenceUrl: null,
        licenceNotice: null,
        isPublic: false,
        isDefault: true,
        domainCount: 0,
        capabilityCount: 0,
      },
      setActiveFramework: vi.fn(),
      isLoading: false,
    });

    const { container } = render(<LicenceFooter />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when no framework is active', () => {
    vi.mocked(useFramework).mockReturnValue({
      frameworks: [],
      activeFramework: null,
      setActiveFramework: vi.fn(),
      isLoading: false,
    });

    const { container } = render(<LicenceFooter />);
    expect(container).toBeEmptyDOMElement();
  });
});
