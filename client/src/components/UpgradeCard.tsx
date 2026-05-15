import { Link } from 'react-router-dom';
import { Crown, Lock, Sparkles } from 'lucide-react';
import type { PaidTier } from '../lib/branding';
import { PRODUCT } from '../lib/branding';

interface UpgradeCardProps {
  /** Required tier(s) to access this feature. */
  requiredTiers: readonly PaidTier[];
  /** Human-friendly feature name shown in the headline. */
  featureName: string;
  /** Brief explanation of what the feature does. */
  description?: string;
  /** Override for the subscription route (defaults to `/subscription`). */
  upgradeHref?: string;
  /** Set when rendered as a modal-like overlay instead of a page replacement. */
  compact?: boolean;
}

const TIER_LABELS: Record<PaidTier, string> = {
  pro: 'Pro',
  enterprise: 'Enterprise',
};

function formatTierList(tiers: readonly PaidTier[]): string {
  const names = tiers.map((t) => TIER_LABELS[t]);
  if (names.length === 0) return 'a paid';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/**
 * Phase 16.4 — colour the UpgradeCard accent in the required tier's
 * shade, not a generic amber. An Enterprise gate looks distinctly
 * indigo; a Pro gate looks teal. Keys off `requiredTiers[0]` because
 * for a `['pro', 'enterprise']` gate, "upgrade to Pro" is the closer
 * step and reads better than the higher tier.
 *
 * Tailwind safelist: the explicit shade strings here ensure the JIT
 * compiler emits these classes even though they only appear inside
 * conditional logic. Listing them as full literals (rather than
 * template-string-built `bg-tier-${tier}-200`) is the
 * documented-safe pattern.
 */
function tierAccent(target: PaidTier): {
  border: string;
  badge: string;
  iconBg: string;
  iconText: string;
  cta: string;
  divider: string;
} {
  if (target === 'enterprise') {
    return {
      border:   'border-tier-enterprise-200 dark:border-tier-enterprise-700/40',
      badge:    'bg-tier-enterprise-200 text-tier-enterprise-700 dark:bg-tier-enterprise-700/40 dark:text-tier-enterprise-200',
      iconBg:   'bg-tier-enterprise-200 dark:bg-tier-enterprise-700/40',
      iconText: 'text-tier-enterprise-700 dark:text-tier-enterprise-200',
      cta:      'bg-tier-enterprise-500 hover:bg-tier-enterprise-700',
      divider:  'border-tier-enterprise-200/60 dark:border-tier-enterprise-700/30',
    };
  }
  // Pro (also the default — the existing teal palette).
  return {
    border:   'border-tier-pro-200 dark:border-tier-pro-700/40',
    badge:    'bg-tier-pro-200 text-tier-pro-700 dark:bg-tier-pro-700/40 dark:text-tier-pro-200',
    iconBg:   'bg-tier-pro-200 dark:bg-tier-pro-700/40',
    iconText: 'text-tier-pro-700 dark:text-tier-pro-200',
    cta:      'bg-tier-pro-500 hover:bg-tier-pro-700',
    divider:  'border-tier-pro-200/60 dark:border-tier-pro-700/30',
  };
}

/**
 * Renders a locked-state upgrade prompt when a user hits a paid-tier
 * feature. This is the UI counterpart to the server's
 * `SUBSCRIPTION_REQUIRED` envelope — the client's `RequireTier` wrapper
 * renders this component instead of the gated content when the tier
 * check fails.
 *
 * The content never implies HERM is paid. It describes what the
 * commercial feature adds on top of the always-free HERM data.
 */
export function UpgradeCard({
  requiredTiers,
  featureName,
  description,
  upgradeHref = '/subscription',
  compact = false,
}: UpgradeCardProps) {
  const tierName = formatTierList(requiredTiers);
  // Phase 16.4 — pick the visual treatment from the LOWEST required
  // tier (closer upgrade step). For ['pro','enterprise'] this lands
  // teal; for ['enterprise']-only routes it lands indigo.
  //
  // Bugbot 8fe3dd6e — pick by explicit rank rather than array
  // position. `RequireTier`'s `tiers` prop is documented as
  // order-irrelevant, so `requiredTiers[0]` is a bug:
  // `['enterprise', 'pro']` would have rendered indigo even though
  // 'pro' is the lower step.
  const targetTier: PaidTier = requiredTiers.includes('pro') ? 'pro' : 'enterprise';
  const accent = tierAccent(targetTier);

  return (
    <div
      role="region"
      aria-label={`${featureName} — upgrade required`}
      className={`mx-auto ${compact ? 'max-w-md' : 'max-w-2xl'} my-8`}
    >
      <div className={`rounded-2xl border bg-white p-8 shadow-sm dark:bg-gray-900 ${accent.border}`}>
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${accent.iconBg} ${accent.iconText}`}>
            <Lock className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {featureName}
              </h2>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${accent.badge}`}>
                <Crown className="h-3 w-3" />
                {tierName}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {description ??
                `This feature is part of the ${tierName} plan. HERM capability data stays free for everyone — ${featureName.toLowerCase()} is an ${PRODUCT.name} commercial add-on.`}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to={upgradeHref}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors ${accent.cta}`}
              >
                <Sparkles className="h-4 w-4" />
                Compare plans
              </Link>
              <Link
                to="/"
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Back to HERM Explorer
              </Link>
            </div>
          </div>
        </div>

        <div className={`mt-6 border-t pt-4 text-xs text-gray-500 dark:text-gray-400 ${accent.divider}`}>
          Free-tier access to the UCISA HERM reference model is unaffected by
          this gate. See{' '}
          <Link
            to="/how-it-works"
            className="underline decoration-dotted hover:text-gray-700 dark:hover:text-gray-200"
          >
            How It Works
          </Link>{' '}
          for what&rsquo;s included at every tier.
        </div>
      </div>
    </div>
  );
}
