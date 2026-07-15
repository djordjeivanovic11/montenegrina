'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, type FormEvent } from 'react';

import { AuthForm } from '../../components/auth-form';
import { API_URL, errorMessage } from '../../lib/api-client';
import { useSession } from '../../lib/hooks/use-session';

export default function SignupPage() {
  const router = useRouter();
  const { refresh, isAuthenticated, isLoading } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [notice, setNotice] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');

  if (!isLoading && isAuthenticated) {
    router.replace('/overview');
  }

  const finishAuth = useCallback(async () => {
    await refresh();
    router.replace('/playground');
  }, [refresh, router]);

  async function signup(event: FormEvent): Promise<void> {
    event.preventDefault();
    setAuthError('');
    setNotice('');
    const response = await fetch(`${API_URL}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email,
        password,
        displayName,
        ...(turnstileToken ? { turnstileToken } : {}),
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setAuthError(errorMessage(body));
      return;
    }
    const body = (await response.json()) as { verificationRequired?: boolean };
    if (body.verificationRequired) {
      setNotice('Check your email to verify your account. The link expires in 30 minutes.');
      return;
    }
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
      setAuthError('Google signup failed');
      return;
    }
    await finishAuth();
  }

  return (
    <AuthForm
      mode="signup"
      email={email}
      password={password}
      displayName={displayName}
      error={authError}
      notice={notice}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onDisplayNameChange={setDisplayName}
      onSubmit={(e) => void signup(e)}
      onGoogleLogin={(c) => void handleGoogleLogin(c)}
      onTurnstileTokenChange={setTurnstileToken}
    />
  );
}
