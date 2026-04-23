import { useFramework } from '../contexts/FrameworkContext';
import { CC_BY_NC_SA_URL, isCcLicence } from '../lib/branding';

/**
 * Persistent one-line attribution footer, rendered globally in the app
 * shell. It guarantees HERM (or any future CC-licensed framework) attribution
 * is visible on every screen where HERM data could appear — not just the
 * three pages that remember to drop in the larger `<LicenceAttribution />`
 * banner.
 *
 * Silent when the active framework is proprietary (no attribution owed).
 */
export function LicenceFooter() {
  const { activeFramework } = useFramework();

  if (!activeFramework || !isCcLicence(activeFramework.licenceType)) {
    return null;
  }

  const ccUrl = activeFramework.licenceUrl ?? CC_BY_NC_SA_URL;
  const licenceLabel = activeFramework.licenceType.replace(/^CC-/, 'CC ');

  return (
    <footer
      className="border-t border-gray-200 bg-white/60 px-4 py-2 text-xs text-gray-500 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-400"
      role="contentinfo"
      aria-label="Framework attribution"
    >
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-2">
        <span>
          Capability data:{' '}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {activeFramework.name}
          </span>
          {activeFramework.publisher ? (
            <>
              {' '}&middot; {activeFramework.publisher}
            </>
          ) : null}
        </span>
        <a
          href={ccUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted hover:text-gray-700 dark:hover:text-gray-200"
        >
          Licensed under {licenceLabel}
        </a>
      </div>
    </footer>
  );
}
