'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { LogoMark } from '../../components/app-sidebar';
import { API_URL, errorMessage } from '../../lib/api-client';
import { useI18n } from '../../lib/i18n/index';

export default function ForgotPasswordPage() {
  const { t } = useI18n('cnr');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError('');
    const response = await fetch(`${API_URL}/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(errorMessage(body));
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-3 mb-3">
            <LogoMark />
            <span className="text-xl font-semibold text-ink">Montenegrina</span>
          </div>
        </div>
        <div className="card p-8">
          <h1 className="text-lg font-semibold text-ink mb-2">{t('auth.forgotPasswordTitle')}</h1>
          <p className="text-sm text-ink-2 mb-6">{t('auth.forgotPasswordDesc')}</p>
          {sent ? (
            <p className="text-sm text-ink-2">{t('auth.forgotPasswordSent')}</p>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
              <label className="field-label">
                {t('auth.email')}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="input-field"
                />
              </label>
              {error && (
                <p className="text-error text-sm" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="btn-primary w-full">
                {t('auth.forgotPasswordSubmit')}
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
