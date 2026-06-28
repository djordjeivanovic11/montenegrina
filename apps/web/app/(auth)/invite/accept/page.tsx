'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type ReactNode } from 'react';

import { LogoMark } from '../../../components/app-sidebar';
import { API_URL, apiHeaders, errorMessage } from '../../../lib/api-client';
import { useSession } from '../../../lib/hooks/use-session';
import { useI18n } from '../../../lib/i18n/index';

function InviteAcceptForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const returnUrl = `/invite/accept?token=${encodeURIComponent(token)}`;
  const { t } = useI18n('cnr');
  const { isAuthenticated, isLoading, refresh } = useSession();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !token || success) return;
    void (async () => {
      const response = await fetch(`${API_URL}/v1/team/invitations/accept`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(errorMessage(body) || t('auth.inviteAcceptInvalid'));
        return;
      }
      setSuccess(true);
      await refresh();
      router.replace('/overview');
    })();
  }, [isAuthenticated, isLoading, token, success, refresh, router, t]);

  if (!token) {
    return (
      <AuthShell title={t('auth.inviteAcceptTitle')}>
        <p className="text-sm text-ink-2">{t('auth.inviteAcceptInvalid')}</p>
      </AuthShell>
    );
  }

  if (isLoading) {
    return (
      <AuthShell title={t('auth.inviteAcceptTitle')}>
        <p className="text-sm text-ink-2">{t('app.loading')}</p>
      </AuthShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthShell title={t('auth.inviteAcceptTitle')}>
        <p className="text-sm text-ink-2 mb-4">{t('auth.inviteAcceptDesc')}</p>
        <p className="text-sm text-ink-2 mb-4">{t('auth.inviteAcceptMismatch')}</p>
        <div className="flex flex-col gap-2">
          <Link href={`/login?returnUrl=${encodeURIComponent(returnUrl)}`} className="btn-primary text-center">
            {t('auth.loginLink')}
          </Link>
          <Link href={`/signup?returnUrl=${encodeURIComponent(returnUrl)}`} className="btn-secondary text-center">
            {t('auth.signupLink')}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.inviteAcceptTitle')}>
      {success ? (
        <p className="text-sm text-ink-2">{t('auth.inviteAcceptSuccess')}</p>
      ) : error ? (
        <p className="text-error text-sm" role="alert">
          {error}
        </p>
      ) : (
        <p className="text-sm text-ink-2">{t('app.loading')}</p>
      )}
    </AuthShell>
  );
}

function AuthShell({ title, children }: { title: string; children: ReactNode }) {
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
          <h1 className="text-lg font-semibold text-ink mb-4">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
      <InviteAcceptForm />
    </Suspense>
  );
}
