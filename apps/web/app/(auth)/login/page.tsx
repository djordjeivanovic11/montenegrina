'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { AuthForm } from '../../components/auth-form';
import { API_URL } from '../../lib/api-client';
import { useSession } from '../../lib/hooks/use-session';

export default function LoginPage() {
  const router = useRouter();
  const { refresh, isAuthenticated, isLoading } = useSession();
  const [authError, setAuthError] = useState('');

  if (!isLoading && isAuthenticated) router.replace('/overview');

  const finishAuth = useCallback(async () => {
    await refresh();
    router.replace('/overview');
  }, [refresh, router]);

  async function handleGoogleLogin(credential: string): Promise<void> {
    setAuthError('');
    const response = await fetch(`${API_URL}/v1/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ credential }),
    });
    if (!response.ok) {
      setAuthError('Google login failed');
      return;
    }
    await finishAuth();
  }

  return (
    <AuthForm
      mode="login"
      error={authError}
      onGoogleLogin={(credential) => void handleGoogleLogin(credential)}
    />
  );
}
