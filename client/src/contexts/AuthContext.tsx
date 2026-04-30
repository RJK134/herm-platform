import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import axios from 'axios';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: string;
  institutionId: string;
  institutionName: string;
  tier: 'free' | 'professional' | 'enterprise';
  /**
   * Present only on tokens minted by `POST /api/admin/impersonate` — carries
   * the SUPER_ADMIN's identity so the client can render the impersonation
   * banner and offer an "End impersonation" exit. Absent on every normal
   * session, including the fresh token returned by `/impersonate/end`.
   */
  impersonator?: {
    userId: string;
    email: string;
    name: string;
  };
}

export interface RegisterData {
  email: string;
  name: string;
  password: string;
  institutionName: string;
  institutionCountry?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  endImpersonation: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'herm_auth_token';

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setAuth = useCallback((newToken: string, userData: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(userData);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
  }, []);

  // Restore session from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${saved}`;
      axios
        .get<{ success: boolean; data: AuthUser }>('/api/auth/me')
        .then(({ data }) => {
          if (data.success) {
            setToken(saved);
            setUser(data.data);
          } else {
            clearAuth();
          }
        })
        .catch(() => clearAuth())
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [clearAuth]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await axios.post<{
        success: boolean;
        data: { token: string; user: AuthUser };
        error?: { message: string };
      }>('/api/auth/login', { email, password });

      if (!data.success) {
        throw new Error(data.error?.message ?? 'Login failed');
      }
      setAuth(data.data.token, data.data.user);
    },
    [setAuth]
  );

  const register = useCallback(
    async (formData: RegisterData) => {
      const { data } = await axios.post<{
        success: boolean;
        data: { token: string; user: AuthUser };
        error?: { message: string };
      }>('/api/auth/register', formData);

      if (!data.success) {
        throw new Error(data.error?.message ?? 'Registration failed');
      }
      setAuth(data.data.token, data.data.user);
    },
    [setAuth]
  );

  const logout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  const endImpersonation = useCallback(async () => {
    // Errors from `/end` come back as non-2xx and Axios throws — the
    // legacy `if (!data.success)` branch was dead. Catch the AxiosError
    // and surface the typed `error.message` so the banner toast says
    // "Already a normal session" or similar instead of the generic
    // "Request failed with status code 400".
    try {
      const { data } = await axios.post<{
        success: true;
        data: { token: string; user: AuthUser };
      }>('/api/admin/impersonate/end');
      setAuth(data.data.token, data.data.user);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const apiMsg = (err.response?.data as { error?: { message?: string } } | undefined)
          ?.error?.message;
        throw new Error(apiMsg ?? 'Failed to end impersonation');
      }
      throw err;
    }
  }, [setAuth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        endImpersonation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within <AuthProvider>');
  }
  return ctx;
}
