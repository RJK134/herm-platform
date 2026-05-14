import type { ReactElement, ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

interface AsyncBoundaryProps<T> {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  data: T | undefined;
  isEmpty?: (data: T) => boolean;
  loadingFallback?: ReactNode;
  errorFallback?: ReactNode;
  emptyFallback?: ReactNode;
  children: (data: T) => ReactNode;
}

/**
 * Small, opinionated wrapper around a react-query result that renders one of:
 *  - loading state
 *  - error state
 *  - empty state (if `isEmpty` says so)
 *  - the children with the loaded data
 *
 * Intended to remove boilerplate from pages without forcing a heavy abstraction.
 */
export function AsyncBoundary<T>({
  isLoading,
  isError,
  error,
  data,
  isEmpty,
  loadingFallback,
  errorFallback,
  emptyFallback,
  children,
}: AsyncBoundaryProps<T>): ReactElement {
  if (isLoading) {
    return (
      <>
        {loadingFallback ?? (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading…</span>
          </div>
        )}
      </>
    );
  }

  if (isError || data === undefined) {
    const message = error instanceof Error ? error.message : 'Something went wrong';
    return (
      <>
        {errorFallback ?? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-red-600">
            <AlertCircle className="w-6 h-6" />
            <p className="font-medium">Failed to load</p>
            <p className="text-sm text-gray-500">{message}</p>
          </div>
        )}
      </>
    );
  }

  if (isEmpty && isEmpty(data)) {
    return (
      <>
        {emptyFallback ?? (
          <div className="py-12 text-center text-gray-500">
            <p>No results yet.</p>
          </div>
        )}
      </>
    );
  }

  return <>{children(data)}</>;
}
