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

  return (
    <div
      role="region"
      aria-label={`${featureName} — upgrade required`}
      className={`mx-auto ${compact ? 'max-w-md' : 'max-w-2xl'} my-8`}
    >
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-teal-50 p-8 shadow-sm dark:border-amber-800/40 dark:from-amber-900/10 dark:via-gray-900 dark:to-teal-900/10">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
            <Lock className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {featureName}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
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
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-teal-700"
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

        <div className="mt-6 border-t border-amber-200/60 pt-4 text-xs text-gray-500 dark:border-amber-800/30 dark:text-gray-400">
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
