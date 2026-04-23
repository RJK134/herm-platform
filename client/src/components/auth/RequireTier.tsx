import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { isPaidTier } from '../../lib/branding';
import type { PaidTier } from '../../lib/branding';
import { UpgradeCard } from '../UpgradeCard';

interface RequireTierProps {
  /** Subscription tier(s) allowed through. Order is irrelevant. */
  tiers: readonly PaidTier[];
  /** Human-friendly name shown in the locked-state card. */
  featureName: string;
  /** Brief explanation of the feature for the locked-state card. */
  description?: string;
  /** Passed through to the UpgradeCard (defaults to `/subscription`). */
  upgradeHref?: string;
  children: ReactNode;
}

/**
 * Client-side tier gate. Mirrors the server's `requirePaidTier`
 * middleware so:
 *   - unauthenticated users are bounced to `/login?returnTo=<path>`,
 *   - SUPER_ADMIN bypasses like it does server-side,
 *   - authenticated users without the required tier see the upgrade
 *     card rather than a blank 403 or a false "not found" page.
 *
 * Route-level gating in `App.tsx` wraps paid-only pages with this.
 * Individual components can also wrap a paid feature inside an otherwise
 * free page with the same `tiers`, `featureName`, and optional
 * `description` / `upgradeHref` props.
 */
export function RequireTier({
  tiers,
  featureName,
  description,
  upgradeHref,
  children,
}: RequireTierProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated || !user) {
    const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  // SUPER_ADMIN bypasses commercial gates, same contract as the server.
  if (user.role === 'SUPER_ADMIN') {
    return <>{children}</>;
  }

  const allowed = new Set<string>(tiers.map((t) => t.toLowerCase()));
  const userTier = (user.tier ?? '').toLowerCase();

  // Any paid-tier user passes a gate whose `tiers` list contains their tier.
  if (allowed.has(userTier) && isPaidTier(userTier)) {
    return <>{children}</>;
  }

  return (
    <UpgradeCard
      requiredTiers={tiers}
      featureName={featureName}
      description={description}
      upgradeHref={upgradeHref}
    />
  );
}
