'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { AppProviders } from './lib/providers';
import { useSession } from './lib/hooks/use-session';
import { MarketingHome } from './(marketing)/marketing-home';

/** Root: redirect authenticated users to /overview, else show marketing. */
function RootPageInner() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/overview');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-2 text-sm">
        Loading…
      </div>
    );
  }

  if (isAuthenticated) return null;

  return <MarketingHome />;
}

export default function RootPage() {
  return (
    <AppProviders>
      <RootPageInner />
    </AppProviders>
  );
}
