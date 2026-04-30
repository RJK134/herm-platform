import { useState } from 'react';
import { UserCog, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';

/**
 * Persistent warning banner rendered globally in the app shell whenever
 * the current JWT carries an `impersonator` claim (Phase 10.3 backend in
 * PR #46). It is the visual companion to the audit-trail behaviour: every
 * action a SUPER_ADMIN takes during a support session is attributed to
 * them in the AuditLog, and this banner ensures the engineer never forgets
 * they are not acting as themselves.
 *
 * Returns null when not impersonating, so it is safe to mount unconditionally.
 */
export function ImpersonationBanner() {
  const { user, endImpersonation } = useAuth();
  const [isEnding, setIsEnding] = useState(false);

  if (!user?.impersonator) {
    return null;
  }

  const handleEnd = async () => {
    setIsEnding(true);
    try {
      await endImpersonation();
      toast.success('Impersonation ended — restored to your account');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to end impersonation';
      toast.error(message);
    } finally {
      // Reset on both success and failure. The banner stays mounted (it
      // just renders null when not impersonating), so without this reset
      // a subsequent impersonation in the same browser session would
      // render the button stuck on "Ending…".
      setIsEnding(false);
    }
  };

  return (
    <div
      // role="status" is the polite-announcement counterpart to role="alert".
      // The banner is a persistent state indicator, not an interrupting alert,
      // so we don't want screen readers to break user focus the way they
      // would for assertive announcements. status carries an implicit
      // aria-live="polite" — declaring it explicitly would conflict.
      role="status"
      className="sticky top-0 z-20 border-b-2 border-amber-700 bg-amber-500 text-white shadow-md dark:bg-amber-600"
      data-testid="impersonation-banner"
    >
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <UserCog className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>
            Viewing as{' '}
            <span className="font-semibold">{user.name}</span>
            <span className="opacity-90"> ({user.email})</span>
          </span>
          {/* Always render the impersonator identity — the safety-rail
              guarantee is that the engineer can ALWAYS see who they really
              are, including on small screens. */}
          <span className="opacity-90">
            — signed in as{' '}
            <span className="font-semibold">{user.impersonator.name}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={handleEnd}
          disabled={isEnding}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          {isEnding ? 'Ending…' : 'End impersonation'}
        </button>
      </div>
    </div>
  );
}
