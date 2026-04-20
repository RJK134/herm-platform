import { useFramework } from '../contexts/FrameworkContext';

/**
 * Converts a licence-type code like "CC-BY-NC-SA-4.0" to a human-readable
 * label ("CC BY-NC-SA 4.0") and the canonical Creative Commons URL.
 */
function parseCcLicence(licenceType: string): { label: string; url: string } | null {
  const match = /^CC-(.+)-(\d+\.\d+)$/.exec(licenceType);
  if (!match) return null;
  const [, flags, version] = match;
  return {
    label: `CC ${flags!.toUpperCase()} ${version}`,
    url: `https://creativecommons.org/licenses/${flags!.toLowerCase()}/${version}/`,
  };
}

/**
 * Displays an attribution banner for the active framework when it uses a
 * Creative Commons licence. Attribution text comes from the framework's own
 * metadata (publisher + name + optional licenceNotice / licenceUrl) so the
 * banner stays accurate when new CC-licensed frameworks are added — it is
 * no longer hard-coded to HERM/CAUDIT.
 */
export function LicenceAttribution() {
  const { activeFramework } = useFramework();

  if (!activeFramework?.licenceType?.startsWith('CC')) {
    return null;
  }

  const cc = parseCcLicence(activeFramework.licenceType) ?? {
    label: activeFramework.licenceType,
    url: 'https://creativecommons.org/',
  };

  const publisherUrl = activeFramework.licenceUrl ?? cc.url;

  return (
    <div className="mt-6 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-300">
      Capability data sourced from{' '}
      <a
        href={publisherUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-blue-600 dark:hover:text-blue-200"
      >
        {activeFramework.name}
        {activeFramework.publisher ? `, published by ${activeFramework.publisher}` : ''}
      </a>{' '}
      under{' '}
      <a
        href={cc.url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-blue-600 dark:hover:text-blue-200"
      >
        {cc.label}
      </a>
      {activeFramework.licenceNotice ? (
        <span className="block mt-1 text-xs opacity-80">{activeFramework.licenceNotice}</span>
      ) : null}
    </div>
  );
}
