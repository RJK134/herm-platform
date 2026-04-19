import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
  /**
   * If the user's role is not in this list, they are redirected to the root.
   * Leave undefined to simply require authentication.
   */
  allowedRoles?: string[];
}

/**
 * Gates a route tree behind an authenticated session.
 *
 * - While auth is hydrating from localStorage, renders nothing (avoids a
 *   login-flash on page reload).
 * - When unauthenticated, redirects to /login and stashes the target path
 *   in `state.from` so the login page can bounce back after success.
 * - When the user's role isn't in `allowedRoles`, redirects to `/`.
 */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
