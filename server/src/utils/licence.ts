import type { Framework } from '@prisma/client';

export interface LicenceInfo {
  type: string;
  publisher: string;
  attribution: string;
  url: string;
}

const CC_LICENCE_TYPES = ['CC-BY-NC-SA-4.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0'];

/**
 * Returns licence metadata for a CC-licensed framework, or null for proprietary frameworks.
 */
export function getLicence(framework: Framework): LicenceInfo | null {
  if (!CC_LICENCE_TYPES.includes(framework.licenceType)) {
    return null;
  }

  return {
    type: framework.licenceType,
    publisher: framework.publisher,
    attribution: `${framework.name}`,
    url: framework.licenceUrl ?? `https://creativecommons.org/licenses/${framework.licenceType.replace('CC-', '').toLowerCase()}/`,
  };
}
