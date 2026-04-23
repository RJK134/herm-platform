/**
 * Procurement project workflow state machine.
 *
 * `ProcurementProject.status` in the schema is a free-form `String` so we
 * don't need a migration to add new states, but that leaves the domain
 * undefended: any controller can stamp any string onto a project. This
 * module is the single place that knows which transitions are valid and
 * who is allowed to make them.
 *
 * States (as published in the PR #17 brief):
 *
 *   draft
 *      ↓ startReview
 *   active_review
 *      ↓ proposeShortlist
 *   shortlist_proposed
 *      ↓ approveShortlist           ↳ back to active_review (revise)
 *   shortlist_approved
 *      ↓ issueRecommendation        ↳ back to shortlist_proposed (reopen)
 *   recommendation_issued
 *      ↓ archive
 *   archived   (terminal)
 *
 * Any state can also `archive` directly, mirroring how a procurement gets
 * cancelled mid-flight.
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

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value);
}

/**
 * Legacy `status` values still stored in the DB from before this enum
 * landed. They map to the closest Phase 3 state so the new UI and API
 * don't choke on historical rows.
 */
const LEGACY_STATUS_MAP: Record<string, ProjectStatus> = {
  active: 'active_review',
  planning: 'draft',
  complete: 'recommendation_issued',
  completed: 'recommendation_issued',
  cancelled: 'archived',
};

/**
 * Coerce a raw DB `status` string into a `ProjectStatus`. Unknown values
 * fall back to `'draft'` so the workflow can always advance from a safe
 * starting point.
 */
export function normaliseStatus(raw: string | null | undefined): ProjectStatus {
  if (!raw) return 'draft';
  if (isProjectStatus(raw)) return raw;
  return LEGACY_STATUS_MAP[raw] ?? 'draft';
}

/** Allowed transitions keyed by the current state. */
const TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  draft: ['active_review', 'archived'],
  active_review: ['shortlist_proposed', 'archived'],
  shortlist_proposed: ['shortlist_approved', 'active_review', 'archived'],
  shortlist_approved: ['recommendation_issued', 'shortlist_proposed', 'archived'],
  recommendation_issued: ['archived'],
  archived: [],
};

/** True if the transition is allowed from the current state. */
export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  if (from === to) return false;
  return (TRANSITIONS[from] as readonly string[]).includes(to);
}

/** Returns the list of next-allowed states from the given state. */
export function nextStates(from: ProjectStatus): readonly ProjectStatus[] {
  return TRANSITIONS[from];
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: ProjectStatus,
    public readonly to: string,
  ) {
    super(`Cannot transition procurement project from '${from}' to '${to}'`);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Validates the proposed transition. Throws `InvalidTransitionError` if
 * the target is not a valid next state from the current one. Returns the
 * typed `ProjectStatus` tuple on success for downstream consumers.
 */
export function assertTransition(
  rawFrom: string | null | undefined,
  rawTo: string,
): { from: ProjectStatus; to: ProjectStatus } {
  const from = normaliseStatus(rawFrom);
  if (!isProjectStatus(rawTo) || !canTransition(from, rawTo)) {
    throw new InvalidTransitionError(from, rawTo);
  }
  return { from, to: rawTo };
}
