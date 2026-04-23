/**
 * Client mirror of the server's project-status state machine. Keep in sync
 * with `server/src/services/domain/procurement/project-status.ts` — any
 * new state or transition on the server must be reflected here, otherwise
 * the UI will hide a valid move or surface an invalid one.
 *
 * Intentionally tiny: only the data the sidebar pill and the transition
 * menu need. No Prisma or HTTP dependencies — pure constants.
 */

export const PROJECT_STATUSES = [
  'draft',
  'active_review',
  'shortlist_proposed',
  'shortlist_approved',
  'recommendation_issued',
  'archived',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ProjectStatusMeta {
  label: string;
  description: string;
  /** Tailwind colour pair for the pill background + text. */
  pillClass: string;
}

export const PROJECT_STATUS_META: Record<ProjectStatus, ProjectStatusMeta> = {
  draft: {
    label: 'Draft',
    description: 'Project scoped but not yet under active review.',
    pillClass:
      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  },
  active_review: {
    label: 'Active review',
    description: 'Requirements captured and systems being assessed.',
    pillClass:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  },
  shortlist_proposed: {
    label: 'Shortlist proposed',
    description: 'A shortlist has been put forward for approval.',
    pillClass:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
  shortlist_approved: {
    label: 'Shortlist approved',
    description: 'Governance signed off on the shortlist.',
    pillClass:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  recommendation_issued: {
    label: 'Recommendation issued',
    description: 'Preferred-supplier recommendation published.',
    pillClass:
      'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  },
  archived: {
    label: 'Archived',
    description: 'Project closed; no further actions expected.',
    pillClass:
      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
};

/**
 * Legacy / v2 status values still in use on existing rows and v2 API
 * surfaces. Maps each one to its nearest Phase 3 state so the pill can
 * render them without needing to teach every call site the new enum.
 */
const LEGACY_MAP: Record<string, ProjectStatus> = {
  active: 'active_review',
  planning: 'draft',
  complete: 'recommendation_issued',
  completed: 'recommendation_issued',
  awarded: 'recommendation_issued',
  cancelled: 'archived',
};

/**
 * Coerce a raw server-supplied status string to a typed state. Unknown
 * values fall back to `'draft'` so the UI never breaks on a historical
 * row.
 */
export function toProjectStatus(raw: string | null | undefined): ProjectStatus {
  if (!raw) return 'draft';
  if ((PROJECT_STATUSES as readonly string[]).includes(raw)) {
    return raw as ProjectStatus;
  }
  return LEGACY_MAP[raw] ?? 'draft';
}

/** Mirror of the server's transition table — keep aligned. */
// Allowed forward transitions live on the server (see
// `server/src/services/domain/procurement/project-status.ts`). The
// client learns them lazily from `GET /api/procurement/projects/:id/status`,
// whose `next` field is the authoritative list. No client-side mirror is
// kept here to avoid two-way drift.
