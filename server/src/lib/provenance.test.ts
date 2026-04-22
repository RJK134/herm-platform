import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { buildProvenance, okWithProvenance } from './provenance';

function makeReq(overrides: Partial<Request> = {}): Request {
  return { framework: undefined, ...overrides } as unknown as Request;
}

function makeRes(): Response {
  return {
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('buildProvenance', () => {
  it('returns null when no framework is attached to the request', () => {
    const req = makeReq();
    expect(buildProvenance(req)).toBeNull();
  });

  it('flags CC licences as requiring attribution', () => {
    const req = makeReq({
      framework: {
        id: 'fw1',
        slug: 'herm-v3.1',
        name: 'UCISA HERM v3.1',
        publisher: 'CAUDIT',
        isPublic: true,
        isDefault: false,
        licenceType: 'CC-BY-NC-SA-4.0',
        licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
        licenceNotice: 'Attribution required',
      },
    });

    const provenance = buildProvenance(req);

    expect(provenance).toEqual({
      framework: {
        id: 'fw1',
        slug: 'herm-v3.1',
        name: 'UCISA HERM v3.1',
        publisher: 'CAUDIT',
        licence: {
          type: 'CC-BY-NC-SA-4.0',
          url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
          notice: 'Attribution required',
          requiresAttribution: true,
        },
      },
    });
  });

  it('does not flag proprietary licences as requiring attribution', () => {
    const req = makeReq({
      framework: {
        id: 'fw2',
        slug: 'fhe-capability-framework',
        name: 'FHE Capability Framework',
        publisher: 'Future Horizons Education',
        isPublic: false,
        isDefault: true,
        licenceType: 'PROPRIETARY',
        licenceUrl: null,
        licenceNotice: null,
      },
    });

    const provenance = buildProvenance(req);
    expect(provenance?.framework.licence.requiresAttribution).toBe(false);
    expect(provenance?.framework.licence.notice).toBeNull();
  });
});

describe('okWithProvenance', () => {
  it('attaches meta.provenance when a framework is present', () => {
    const req = makeReq({
      framework: {
        id: 'fw1',
        slug: 'herm-v3.1',
        name: 'UCISA HERM v3.1',
        publisher: 'CAUDIT',
        isPublic: true,
        isDefault: false,
        licenceType: 'CC-BY-NC-SA-4.0',
        licenceUrl: null,
        licenceNotice: null,
      },
    });
    const res = makeRes();

    okWithProvenance(res, req, { value: 42 });

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: { value: 42 },
        meta: expect.objectContaining({
          provenance: expect.objectContaining({
            framework: expect.objectContaining({ slug: 'herm-v3.1' }),
          }),
        }),
      }),
    );
  });

  it('merges extra meta fields with provenance', () => {
    const req = makeReq({
      framework: {
        id: 'fw1',
        slug: 'herm-v3.1',
        name: 'UCISA HERM v3.1',
        publisher: 'CAUDIT',
        isPublic: true,
        isDefault: false,
        licenceType: 'CC-BY-NC-SA-4.0',
        licenceUrl: null,
        licenceNotice: null,
      },
    });
    const res = makeRes();

    okWithProvenance(res, req, [], { total: 10, page: 1 });

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          total: 10,
          page: 1,
          provenance: expect.any(Object),
        }),
      }),
    );
  });

  it('omits meta entirely when there is no framework and no extra meta', () => {
    const req = makeReq();
    const res = makeRes();

    okWithProvenance(res, req, { value: 1 });

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { value: 1 } });
  });
});
