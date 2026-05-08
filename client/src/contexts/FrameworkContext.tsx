import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { api } from '../lib/api';
import { isPaidTier } from '../lib/branding';
import { useAuthContext } from './AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Framework {
  id: string;
  slug: string;
  name: string;
  version: string;
  publisher: string;
  description?: string;
  licenceType: string;
  licenceNotice?: string | null;
  licenceUrl?: string | null;
  isPublic: boolean;
  isDefault: boolean;
  domainCount: number;
  capabilityCount: number;
}

interface FrameworkContextValue {
  frameworks: Framework[];
  activeFramework: Framework | null;
  setActiveFramework: (framework: Framework) => void;
  isLoading: boolean;
}

// ── Context ───────────────────────────────────────────────────────────────────

const FrameworkContext = createContext<FrameworkContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function FrameworkProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthContext();
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [activeFramework, setActiveFramework] = useState<Framework | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const selectDefault = useCallback(
    (list: Framework[]) => {
      if (list.length === 0) return null;

      const isPaid = isPaidTier(user?.tier);

      // UAT D-01 (May 2026) — empty frameworks land users on a 0% / 0-of-0
      // experience that destroys credibility in the first 30 seconds.
      // Filter out frameworks with zero capabilities BEFORE choosing a
      // default so a misseded "FHE Capability Framework" placeholder
      // (`isDefault: true`, capabilityCount: 0) can't outrank UCISA HERM
      // v3.1 (`isPublic: true`, capabilityCount: 165). Falls back to the
      // unfiltered list only if every framework is empty — degraded but
      // not broken state, e.g. mid-migration.
      const nonEmpty = list.filter((f) => f.capabilityCount > 0);
      const candidates = nonEmpty.length > 0 ? nonEmpty : list;

      // Paid users default to isDefault=true; free/anonymous default to isPublic=true.
      const preferred = isPaid
        ? candidates.find((f) => f.isDefault) ?? candidates.find((f) => f.isPublic) ?? candidates[0]
        : candidates.find((f) => f.isPublic) ?? candidates[0];

      return preferred;
    },
    [user?.tier]
  );

  useEffect(() => {
    setIsLoading(true);
    // Use the shared authenticated API client so the JWT (and any future
    // auth headers) travel with this request — critical for paid-tier
    // callers whose account can see the proprietary framework list.
    api
      .listFrameworks()
      .then(({ data: payload }) => {
        if (payload.success && Array.isArray(payload.data)) {
          setFrameworks(payload.data as Framework[]);
          const defaultFw = selectDefault(payload.data as Framework[]);
          setActiveFramework(defaultFw);
        }
      })
      .catch(() => {
        // If the frameworks endpoint fails, continue with an empty list —
        // the UI will render the public fallback served by framework-context
        // middleware on the server.
        setFrameworks([]);
        setActiveFramework(null);
      })
      .finally(() => setIsLoading(false));
  }, [selectDefault]);

  return (
    <FrameworkContext.Provider
      value={{
        frameworks,
        activeFramework,
        setActiveFramework,
        isLoading,
      }}
    >
      {children}
    </FrameworkContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFramework(): FrameworkContextValue {
  const ctx = useContext(FrameworkContext);
  if (!ctx) {
    throw new Error('useFramework must be used within <FrameworkProvider>');
  }
  return ctx;
}
