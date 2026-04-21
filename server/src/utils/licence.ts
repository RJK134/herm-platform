import type { Framework } from '@prisma/client';

export interface LicenceInfo {
  type: string;
  publisher: string;
  attribution: string;
  url: string;
}

const CC_LICENCE_TYPES = ['CC-BY-NC-SA-4.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0'];

/**
 * Convert a licenceType code like "CC-BY-NC-SA-4.0" to the canonical
 * Creative Commons URL fragment "by-nc-sa/4.0".
 *
 * CC URLs use the form `/licenses/<flags>/<version>/` — the version is a
 * separate path segment. The previous implementation collapsed them into
 * one segment (`by-nc-sa-4.0`) which yields a 404 on creativecommons.org.
 */
function ccUrlFragment(licenceType: string): string | null {
  // Expect "CC-<flags-separated-by-dashes>-<major>.<minor>"
  const match = /^CC-(.+)-(\d+\.\d+)$/.exec(licenceType);
  if (!match) return null;
  const [, flags, version] = match;
  return `${flags!.toLowerCase()}/${version}`;
}

/**
 * Returns licence metadata for a CC-licensed framework, or null for proprietary frameworks.
 */
export function getLicence(framework: Framework): LicenceInfo | null {
  if (!CC_LICENCE_TYPES.includes(framework.licenceType)) {
    return null;
  }

  const fragment = ccUrlFragment(framework.licenceType);
  const defaultUrl = fragment ? `https://creativecommons.org/licenses/${fragment}/` : 'https://creativecommons.org/';

  return {
    type: framework.licenceType,
    publisher: framework.publisher,
    attribution: `${framework.name}`,
    url: framework.licenceUrl ?? defaultUrl,
  };
}
