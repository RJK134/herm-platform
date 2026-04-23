import {
  PROJECT_STATUS_META,
  toProjectStatus,
} from '../../lib/project-status';
import type { ProjectStatus } from '../../lib/project-status';

interface ProjectStatusPillProps {
  /** Raw server-supplied status; non-canonical values are normalised. */
  status: string | null | undefined;
  /** Optional compact variant used in dense tables. */
  compact?: boolean;
  /** Override for the tooltip. Defaults to the state's description. */
  title?: string;
}

/**
 * Compact status indicator for procurement projects. Driven from the
 * canonical `PROJECT_STATUS_META` table so colour + label + description
 * stay consistent across every place a project surfaces.
 *
 * Legacy statuses (e.g. `'active'`) are normalised via
 * `toProjectStatus()` so the pill never shows a raw DB string.
 */
export function ProjectStatusPill({ status, compact, title }: ProjectStatusPillProps) {
  const normalised: ProjectStatus = toProjectStatus(status);
  const meta = PROJECT_STATUS_META[normalised];

  return (
    <span
      role="status"
      aria-label={`Project status: ${meta.label}`}
      title={title ?? meta.description}
      className={`inline-flex items-center rounded-full font-medium ${
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      } ${meta.pillClass}`}
    >
      {meta.label}
    </span>
  );
}
