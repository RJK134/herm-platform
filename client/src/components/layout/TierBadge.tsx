import type { ReactElement } from 'react';
import { Crown } from 'lucide-react';

interface TierBadgeProps {
  tier: string;
  /**
   * `pill` (default) renders the badge inside a coloured chip — for the
   * sidebar / topbar / login chrome. `inline` is text-only with the
   * tier-accent colour; useful inside paragraphs and the Subscriptions
   * page header.
   */
  variant?: 'pill' | 'inline';
  /** Optional className appended to the root span. */
  className?: string;
}

const TIER_LABELS: Record<string, string> = {
  free:       'Free',
  pro:        'Pro',
  enterprise: 'Enterprise',
};

/**
 * Phase 16.4 — TierBadge.
 *
 * Replaces the old `TIER_COLOURS` dict in Sidebar.tsx with a tier-aware
 * pill that picks its colour from the `tier-accent-*` utilities defined
 * in `index.css` (see Phase 16.3). The actual colour resolves at render
 * time from `[data-tier="..."]` on `<html>` (set by AuthContext).
 *
 * One component used everywhere a "current tier" indicator is needed —
 * sidebar footer, topbar (when added), Subscriptions page header. Keeps
 * the visual treatment consistent and means a future palette tweak is a
 * one-file edit instead of a grep.
 */
export function TierBadge({ tier, variant = 'pill', className = '' }: TierBadgeProps): ReactElement {
  const lower = (tier ?? 'free').toLowerCase();
  const label = TIER_LABELS[lower] ?? lower;

  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold tier-accent-text ${className}`}>
        <Crown className="w-3 h-3" />
        {label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium text-white tier-accent-bg ${className}`}
    >
      <Crown className="w-3 h-3" />
      {label}
    </span>
  );
}
