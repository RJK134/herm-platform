import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import axios from 'axios';
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

      const isPaid =
        user?.tier === 'professional' || user?.tier === 'enterprise';

      // Paid users default to isDefault=true; free/anonymous default to isPublic=true
      const preferred = isPaid
        ? list.find((f) => f.isDefault) ?? list.find((f) => f.isPublic) ?? list[0]
        : list.find((f) => f.isPublic) ?? list[0];

      return preferred;
    },
    [user?.tier]
  );

  useEffect(() => {
    setIsLoading(true);
    axios
      .get<{ success: boolean; data: Framework[] }>('/api/frameworks')
      .then(({ data }) => {
        if (data.success && Array.isArray(data.data)) {
          setFrameworks(data.data);
          const defaultFw = selectDefault(data.data);
          setActiveFramework(defaultFw);
        }
      })
      .catch(() => {
        // If frameworks endpoint fails, continue with empty list
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
