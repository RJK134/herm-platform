// Skeleton primitives for loading states. Phase 14.4 added SkeletonBar
// and the multi-column SkeletonTable variant — pages that fetch data
// on mount should render skeletons of the right shape rather than the
// "Loading..." placeholder UAT flagged. SkeletonTable defaults are
// tuned for a typical leaderboard / capability table.

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`}
      aria-hidden="true"
    />
  );
}

// Phase 14.4 — single-row bar variant. Useful for inline label
// placeholders (e.g. dashboard tiles) where the host already provides
// width context via Tailwind's grid/flex classes.
export function SkeletonBar({ className = '', width = 'w-full' }: { className?: string; width?: string }) {
  return <Skeleton className={`h-3 ${width} ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3"
      aria-hidden="true"
    >
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 1 }: { rows?: number; cols?: number }) {
  // cols=1 preserves the original single-column behaviour for callers
  // that already use the API; cols>1 renders a grid for table-like
  // shapes (Phase 14.4 — used by Capability Heatmap, vendor showcase).
  if (cols <= 1) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading table">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  return (
    <div className="space-y-3" role="status" aria-label="Loading table">
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex gap-3">
          {Array.from({ length: cols }).map((_, colIdx) => (
            <Skeleton key={colIdx} className="h-8 flex-1" />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
