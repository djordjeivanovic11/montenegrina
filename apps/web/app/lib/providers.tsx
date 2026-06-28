'use client';

import type { ReactNode } from 'react';

import { SessionProvider } from './hooks/use-session';
import { WorkspaceProvider } from './hooks/use-workspace';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <WorkspaceProvider>{children}</WorkspaceProvider>
    </SessionProvider>
  );
}
