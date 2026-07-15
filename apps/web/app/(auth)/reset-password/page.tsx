'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';

import { LogoMark } from '../../components/app-sidebar';
import { API_URL, errorMessage } from '../../lib/api-client';
import { useI18n } from '../../lib/i18n/index';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { t } = useI18n('cnr');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError('');
    if (!token) {
      setError(t('auth.resetPasswordInvalid'));
      return;
    }
    const response = await fetch(`${API_URL}/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token, password }),
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      setError(errorMessage(body) || t('auth.resetPasswordInvalid'));
      return;
    }
    setSuccess(true);
    setTimeout(() => router.replace('/login'), 2000);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-3 mb-3">
            <LogoMark />
            <span className="text-xl font-semibold text-ink">Montenegrina</span>
          </div>
        </div>
        <div className="card p-8">
          <h1 className="text-lg font-semibold text-ink mb-6">{t('auth.resetPasswordTitle')}</h1>
          {success ? (
            <p className="text-sm text-ink-2">{t('auth.resetPasswordSuccess')}</p>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
              <label className="field-label">
                {t('auth.password')}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={12}
                  className="input-field"
                />
              </label>
              {error && (
                <p className="text-error text-sm" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="btn-primary w-full">
                {t('auth.resetPasswordSubmit')}
              </button>
            </form>
          )}
          <p className="text-sm text-ink-2 text-center mt-6">
            <Link href="/login" className="text-accent hover:underline">
              {t('auth.loginLink')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
