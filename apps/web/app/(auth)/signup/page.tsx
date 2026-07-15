'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { AuthForm } from '../../components/auth-form';
import { API_URL } from '../../lib/api-client';
import { useSession } from '../../lib/hooks/use-session';

export default function SignupPage() {
  const router = useRouter();
  const { refresh, isAuthenticated, isLoading } = useSession();
  const [authError, setAuthError] = useState('');

  if (!isLoading && isAuthenticated) router.replace('/playground');

  const finishAuth = useCallback(async () => {
    await refresh();
    router.replace('/playground');
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
      setAuthError('Google signup failed');
      return;
    }
    await finishAuth();
  }

  return (
    <AuthForm
      mode="signup"
      error={authError}
      onGoogleLogin={(credential) => void handleGoogleLogin(credential)}
    />
  );
}
