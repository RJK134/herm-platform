import { describe, it, expect } from 'vitest';
import { getLicence } from './licence';
import type { Framework } from '@prisma/client';

function makeFramework(overrides: Partial<Framework> = {}): Framework {
  return {
    id: 'fw1',
    slug: 'herm-v3',
    name: 'UCISA HERM v3.1',
    version: '3.1',
    publisher: 'CAUDIT',
    description: 'HE Reference Model',
    licenceType: 'CC-BY-NC-SA-4.0',
    licenceNotice: 'Attribution required',
    licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    isPublic: true,
    isDefault: true,
    isActive: true,
    domainCount: 10,
    capabilityCount: 165,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Framework;
}

describe('getLicence', () => {
  it('returns licence object for CC-BY-NC-SA-4.0 framework', () => {
    const framework = makeFramework({ licenceType: 'CC-BY-NC-SA-4.0' });
    const result = getLicence(framework);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('CC-BY-NC-SA-4.0');
    expect(result!.publisher).toBe('CAUDIT');
    expect(result!.attribution).toBe('UCISA HERM v3.1');
    expect(result!.url).toBe('https://creativecommons.org/licenses/by-nc-sa/4.0/');
  });

  it('returns null for PROPRIETARY framework', () => {
    const framework = makeFramework({ licenceType: 'PROPRIETARY' });
    const result = getLicence(framework);

    expect(result).toBeNull();
  });

  it('returns correct fields (type, publisher, attribution, url)', () => {
    const framework = makeFramework({
      name: 'Custom CC Framework',
      publisher: 'Test Publisher',
      licenceType: 'CC-BY-4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    });
    const result = getLicence(framework);

    expect(result).not.toBeNull();
    expect(result).toEqual({
      type: 'CC-BY-4.0',
      publisher: 'Test Publisher',
      attribution: 'Custom CC Framework',
      url: 'https://creativecommons.org/licenses/by/4.0/',
    });
  });

  it('generates a default URL when licenceUrl is null', () => {
    const framework = makeFramework({
      licenceType: 'CC-BY-SA-4.0',
      licenceUrl: null,
    });
    const result = getLicence(framework);

    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
  });

  it('returns licence for CC-BY-NC-4.0', () => {
    const framework = makeFramework({ licenceType: 'CC-BY-NC-4.0' });
    const result = getLicence(framework);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('CC-BY-NC-4.0');
  });

  it('returns null for unrecognised licence type', () => {
    const framework = makeFramework({ licenceType: 'MIT' });
    const result = getLicence(framework);

    expect(result).toBeNull();
  });
});
