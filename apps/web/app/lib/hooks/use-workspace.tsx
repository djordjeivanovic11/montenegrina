'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setApiClientContext } from '../api-client';
import { useSession, type SessionOrganization } from './use-session';

const STORAGE_KEY = 'montenegrina-org-id';

type WorkspaceState = {
  organization: SessionOrganization | null;
  organizationId: string;
  setOrganizationId: (id: string) => void;
};

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { organizations, isLoading } = useSession();
  const [organizationId, setOrganizationIdState] = useState('');

  useEffect(() => {
    if (isLoading) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    const match = organizations.find((org) => org.id === stored) ?? organizations[0];
    const nextId = match?.id ?? '';
    setOrganizationIdState(nextId);
    setApiClientContext({ organizationId: nextId });
  }, [organizations, isLoading]);

  const setOrganizationId = useCallback(
    (id: string) => {
      setOrganizationIdState(id);
      localStorage.setItem(STORAGE_KEY, id);
      setApiClientContext({ organizationId: id });
    },
    [],
  );

  const organization = useMemo(
    () => organizations.find((org) => org.id === organizationId) ?? null,
    [organizations, organizationId],
  );

  const value = useMemo(
    () => ({ organization, organizationId, setOrganizationId }),
    [organization, organizationId, setOrganizationId],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
