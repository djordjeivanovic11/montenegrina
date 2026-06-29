'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { AppSidebar } from '../components/app-sidebar';
import { AppProviders } from '../lib/providers';
import { useSession } from '../lib/hooks/use-session';
import { useWorkspace } from '../lib/hooks/use-workspace';

function AppLayoutInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useSession();
  const { organization } = useWorkspace();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (
      organization &&
      !organization.onboarding.isComplete &&
      pathname !== '/onboarding'
    ) {
      router.replace('/onboarding');
    }
  }, [isAuthenticated, isLoading, organization, pathname, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-2 text-sm">
        Loading…
      </div>
    );
  }

  const isPlayground = pathname === '/playground';
  const isOnboarding = pathname === '/onboarding';
  const isKnowledge = pathname === '/knowledge';

  if (isPlayground || isOnboarding) {
    return <div className="min-h-screen bg-bg">{children}</div>;
  }

  return (
    <div className="app-shell">
      <AppSidebar />
      <main className={isKnowledge ? 'app-main app-main-fill' : 'app-main'}>{children}</main>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <AppLayoutInner>{children}</AppLayoutInner>
    </AppProviders>
  );
}
