'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { API_URL } from '../../lib/api-client';
import { useSession } from '../../lib/hooks/use-session';

function VerifyEmailContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh } = useSession();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('The verification link is invalid.');
      return;
    }
    void fetch(`${API_URL}/v1/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        if (!response.ok) {
          setError('The verification link is invalid or expired.');
          return;
        }
        await refresh();
        router.replace('/playground');
      })
      .catch(() => {
        setError('The verification link is invalid or expired.');
      });
  }, [params, refresh, router]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="card p-8 max-w-md text-center">
        <h1 className="text-xl font-semibold mb-3">Verifying your email</h1>
        {error ? (
          <>
            <p className="text-error mb-4">{error}</p>
            <Link href="/signup" className="text-accent">
              Return to signup
            </Link>
          </>
        ) : (
          <p>Please wait…</p>
        )}
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center px-4">
          <div className="card p-8 max-w-md text-center">
            <h1 className="text-xl font-semibold mb-3">Verifying your email</h1>
            <p>Please wait…</p>
          </div>
        </main>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
