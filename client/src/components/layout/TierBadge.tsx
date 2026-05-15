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
 * Vercel review-bot b776cb58 (FIX) — the colour MUST track the `tier`
 * prop, not the current user's tier (which is what the global
 * `[data-tier]` attribute on <html> reflects). If a Pro user views a
 * Subscriptions table that renders `<TierBadge tier="enterprise" />`
 * to label the Enterprise column, the label says "Enterprise" but
 * the colour from `tier-accent-bg` would resolve to teal (the user's
 * Pro tier). Mismatch.
 *
 * Fix: pick the colour class explicitly per the prop. Tailwind
 * safelist: the four full class strings appear verbatim below so the
 * JIT compiler emits them even though they live in conditional
 * lookup tables.
 */
const PILL_COLOURS: Record<string, string> = {
  free:       'bg-tier-free-500 text-white',
  pro:        'bg-tier-pro-500 text-white',
  enterprise: 'bg-tier-enterprise-500 text-white',
};

const INLINE_COLOURS: Record<string, string> = {
  free:       'text-tier-free-500',
  pro:        'text-tier-pro-500',
  enterprise: 'text-tier-enterprise-500',
};

/**
 * Phase 16.4 — TierBadge.
 *
 * Replaces the old `TIER_COLOURS` dict in Sidebar.tsx with a tier-aware
 * pill that picks its colour from the `tier` prop. One component used
 * everywhere a tier indicator is needed — sidebar footer, topbar (when
 * added), Subscriptions table column headers. The prop drives both
 * label and colour, so non-current-user tiers (e.g. column headers
 * showing what each plan looks like) render correctly regardless of
 * the viewer's own tier.
 */
export function TierBadge({ tier, variant = 'pill', className = '' }: TierBadgeProps): ReactElement {
  const lower = (tier ?? 'free').toLowerCase();
  const label = TIER_LABELS[lower] ?? lower;

  if (variant === 'inline') {
    const colourClass = INLINE_COLOURS[lower] ?? INLINE_COLOURS['free']!;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${colourClass} ${className}`}>
        <Crown className="w-3 h-3" />
        {label}
      </span>
    );
  }

  const colourClass = PILL_COLOURS[lower] ?? PILL_COLOURS['free']!;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${colourClass} ${className}`}
    >
      <Crown className="w-3 h-3" />
      {label}
    </span>
  );
}
