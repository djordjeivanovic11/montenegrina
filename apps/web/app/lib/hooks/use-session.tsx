'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { API_URL, setApiClientContext } from '../api-client';

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
};

export type SessionOrganization = {
  id: string;
  name: string;
  slug: string;
  role: string;
  onboarding: {
    currentStep: string;
    completedAt: string | null;
    isComplete: boolean;
  };
};

type SessionState = {
  user: SessionUser | null;
  csrfToken: string;
  organizations: SessionOrganization[];
  isLoading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setSession: (data: {
    user: SessionUser;
    csrfToken: string;
    organizations: SessionOrganization[];
  }) => void;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [csrfToken, setCsrfToken] = useState('');
  const [organizations, setOrganizations] = useState<SessionOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const applySession = useCallback(
    (data: { user: SessionUser; csrfToken: string; organizations: SessionOrganization[] }) => {
      setUser(data.user);
      setCsrfToken(data.csrfToken);
      setOrganizations(data.organizations);
      setApiClientContext({ csrfToken: data.csrfToken });
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/v1/auth/me`, { credentials: 'include' });
      if (!response.ok) {
        setUser(null);
        setCsrfToken('');
        setOrganizations([]);
        setApiClientContext({ csrfToken: '' });
        return;
      }
      const data = (await response.json()) as {
        user: SessionUser;
        csrfToken: string;
        organizations: SessionOrganization[];
      };
      applySession(data);
    } catch {
      setUser(null);
      setCsrfToken('');
      setOrganizations([]);
    } finally {
      setIsLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch(`${API_URL}/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
    });
    setUser(null);
    setCsrfToken('');
    setOrganizations([]);
    setApiClientContext({ csrfToken: '', organizationId: '' });
  }, [csrfToken]);

  const value = useMemo(
    () => ({
      user,
      csrfToken,
      organizations,
      isLoading,
      isAuthenticated: Boolean(user && csrfToken),
      refresh,
      logout,
      setSession: applySession,
    }),
    [user, csrfToken, organizations, isLoading, refresh, logout, applySession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
