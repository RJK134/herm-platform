import { useFramework } from '../contexts/FrameworkContext';

/**
 * Displays a CC BY-NC-SA 4.0 attribution banner when the active framework
 * uses a Creative Commons licence. Not shown for proprietary frameworks.
 */
export function LicenceAttribution() {
  const { activeFramework } = useFramework();

  // Only show for CC-licensed frameworks
  if (!activeFramework?.licenceType?.startsWith('CC')) {
    return null;
  }

  return (
    <div className="mt-6 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-300">
      Capability data sourced from{' '}
      <a
        href="https://www.caudit.edu.au"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-blue-600 dark:hover:text-blue-200"
      >
        UCISA HERM v3.1, published by CAUDIT
      </a>{' '}
      under{' '}
      <a
        href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-blue-600 dark:hover:text-blue-200"
      >
        CC BY-NC-SA 4.0
      </a>
    </div>
  );
}
