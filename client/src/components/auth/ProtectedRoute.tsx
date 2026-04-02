import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If true, redirects to login if not authenticated */
  requireAuth?: boolean;
  /** Allowed roles — if provided, user must have one of these roles */
  roles?: string[];
}

export function ProtectedRoute({
  children,
  requireAuth = true,
  roles,
}: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
          Access restricted
        </p>
        <p className="text-sm text-gray-500">
          Your role ({user.role}) does not have access to this page.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
