import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import axios from 'axios';
import type { AuthUser } from '../contexts/AuthContext';

/**
 * Landing page for the SSO 302 redirect (Phase 10.10).
 *
 * The server-side flow ends with `302 → /login/sso?token=<jwt>`. This
 * page reads the token, fetches the user shape via /api/auth/me, and
 * hard-reloads to `/` so AuthProvider re-runs its localStorage restore
 * effect and the rest of the app sees a hydrated user.
 *
 * On error (missing or invalid token) we redirect to /login with an
 * error banner — the same generic failure mode the server-side flow
 * uses for IdP errors. We never echo specifics; the IdP's failure
 * detail is server-logged.
 *
 * Deliberately does NOT consume the AuthContext: the bridge here is
 * localStorage + axios defaults + a hard reload, not a context patch.
 * Including the auth context in deps would cause the effect to re-fire
 * on AuthProvider initialization and issue a duplicate /me request.
 */
export function SsoCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

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

    function clearStaleAuth() {
      // /me rejected our shiny new token — most likely the SSO callback
      // landed with a tampered or expired query param. Don't leave a
      // bad token in localStorage where the next request would still
      // use it.
      localStorage.removeItem('herm_auth_token');
      delete axios.defaults.headers.common['Authorization'];
    }

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
          clearStaleAuth();
          navigate('/login?error=sso_failed', { replace: true });
        }
      })
      .catch(() => {
        if (cancelled) return;
        clearStaleAuth();
        navigate('/login?error=sso_failed', { replace: true });
      });

    return () => {
      cancelled = true;
    };
    // `params` and `navigate` are stable identities from react-router;
    // including them is enough. We deliberately do NOT depend on auth
    // context — see the doc comment above.
  }, [params, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="text-center">
        <ShieldCheck className="w-10 h-10 text-teal-600 mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm text-gray-700 dark:text-gray-200">Completing sign-in…</p>
      </div>
    </div>
  );
}
