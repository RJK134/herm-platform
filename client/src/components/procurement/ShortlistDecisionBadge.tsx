import { Check, X, Clock } from 'lucide-react';

export type DecisionStatus = 'pending' | 'approved' | 'rejected';

interface ShortlistDecisionBadgeProps {
  decisionStatus: string | null | undefined;
  rationale?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
}

/**
 * Compact badge for a shortlist entry's decision status. Exposes the
 * rationale + reviewer + decided-at date through the tooltip so a
 * reviewer scanning a long shortlist can see *why* each system got the
 * decision it did, without opening a modal per row.
 *
 * A decision without rationale is a flag for Phase 3 — the API makes
 * rationale mandatory on approve/reject, so a rendering like "Approved
 * (no rationale)" indicates a legacy entry we should backfill.
 */
export function ShortlistDecisionBadge({
  decisionStatus,
  rationale,
  decidedBy,
  decidedAt,
}: ShortlistDecisionBadgeProps) {
  const status = normalise(decisionStatus);
  const { label, icon: Icon, pillClass } = META[status];

  const tooltipParts: string[] = [];
  if (rationale) tooltipParts.push(rationale);
  if (decidedBy) tooltipParts.push(`— ${decidedBy}`);
  if (decidedAt) {
    try {
      tooltipParts.push(`on ${new Date(decidedAt).toLocaleDateString('en-GB')}`);
    } catch {
      // Silently skip malformed date strings.
    }
  }
  const tooltip =
    tooltipParts.length > 0
      ? tooltipParts.join(' ')
      : status === 'pending'
        ? 'Awaiting decision'
        : `${label} — no rationale recorded`;

  // No `role="status"` — ARIA live regions are for dynamic updates and
  // cause noisy announcements on every re-render of a long shortlist.
  // The visible text plus `aria-label` carry the accessible name.
  return (
    <span
      aria-label={`Shortlist decision: ${label}`}
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${pillClass}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

function normalise(raw: string | null | undefined): DecisionStatus {
  if (raw === 'approved' || raw === 'rejected') return raw;
  return 'pending';
}

const META: Record<
  DecisionStatus,
  { label: string; icon: typeof Check; pillClass: string }
> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    pillClass: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  },
  approved: {
    label: 'Approved',
    icon: Check,
    pillClass:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  rejected: {
    label: 'Rejected',
    icon: X,
    pillClass: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
};
