'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, type FormEvent } from 'react';

import { AuthForm } from '../../components/auth-form';
import { API_URL, api, errorMessage } from '../../lib/api-client';
import { useSession } from '../../lib/hooks/use-session';

export default function LoginPage() {
  const router = useRouter();
  const { setSession, refresh, isAuthenticated, isLoading } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  if (!isLoading && isAuthenticated) {
    router.replace('/overview');
  }

  const finishAuth = useCallback(async () => {
    await refresh();
    router.replace('/overview');
  }, [refresh, router]);

  async function login(event: FormEvent): Promise<void> {
    event.preventDefault();
    setAuthError('');
    const response = await api.POST('/v1/auth/login', { body: { email, password } });
    if (response.error) {
      setAuthError(errorMessage(response.error));
      return;
    }
    setSession({
      user: response.data.user as { id: string; email: string; displayName: string; avatarUrl?: string },
      csrfToken: response.data.csrfToken,
      organizations: [],
    });
    await finishAuth();
  }

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
      email={email}
      password={password}
      error={authError}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={(e) => void login(e)}
      onGoogleLogin={(c) => void handleGoogleLogin(c)}
    />
  );
}
