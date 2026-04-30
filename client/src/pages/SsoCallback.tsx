import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import axios from 'axios';
import type { AuthUser } from '../contexts/AuthContext';

/**
 * Landing page for the SSO 302 redirect (Phase 10.10).
 *
 * The server-side flow ends with `302 → /login/sso?token=<jwt>`. This
 * page reads the token, fetches the user shape via /api/auth/me, hands
 * both to the AuthContext, and navigates to the original target.
 *
 * On error (missing or invalid token) we redirect to /login with an
 * error banner — the same generic failure mode the server-side flow
 * uses for IdP errors. We never echo specifics; the IdP's failure
 * detail is server-logged.
 */
export function SsoCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // We do NOT use useAuth().login — that's password-only. Instead we
  // mimic AuthProvider's setAuth via localStorage + a manual /me call.
  // A future refactor could expose a `setAuthFromToken(token)` on the
  // context; deferred to keep this PR focused.
  const auth = useAuth() as ReturnType<typeof useAuth> & {
    // shimmed because we know the context exposes setAuth indirectly.
  };

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      navigate('/login?error=sso_failed', { replace: true });
      return;
    }
    // Persist + axios default; mirrors AuthProvider.setAuth. Then refresh
    // /me to populate the in-memory user (so the rest of the app sees a
    // hydrated AuthContext on the very next render).
    localStorage.setItem('herm_auth_token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    let cancelled = false;
    axios
      .get<{ success: boolean; data: AuthUser }>('/api/auth/me')
      .then(({ data }) => {
        if (cancelled) return;
        if (data.success) {
          // Force a full reload so AuthProvider re-runs the
          // localStorage-restore effect and the rest of the app
          // observes the hydrated user. Avoiding a context patch on
          // a child page; the alternative is a context refactor.
          window.location.replace('/');
        } else {
          navigate('/login?error=sso_failed', { replace: true });
        }
      })
      .catch(() => {
        if (cancelled) return;
        navigate('/login?error=sso_failed', { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [params, navigate, auth]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="text-center">
        <ShieldCheck className="w-10 h-10 text-teal-600 mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm text-gray-700 dark:text-gray-200">Completing sign-in…</p>
      </div>
    </div>
  );
}
