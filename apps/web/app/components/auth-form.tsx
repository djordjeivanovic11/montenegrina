'use client';

import Link from 'next/link';

import { LogoMark } from './app-sidebar';
import { useGoogleSignIn } from '../lib/hooks/use-google-sign-in';
import { useI18n, type Locale } from '../lib/i18n/index';

interface AuthFormProps {
  mode: 'login' | 'signup';
  locale?: Locale;
  error: string;
  onGoogleLogin: (credential: string) => void;
}

export function AuthForm({ mode, locale = 'cnr', error, onGoogleLogin }: AuthFormProps) {
  const { t } = useI18n(locale);
  const { signIn, buttonHostRef, ready, configured, loadError } = useGoogleSignIn(onGoogleLogin);
  const displayError = error || (loadError ? t(`auth.${loadError}`) : '');

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
          <h1 className="text-lg font-semibold text-ink mb-2">
            {mode === 'login' ? t('auth.loginTitle') : t('auth.signupTitle')}
          </h1>
          <p className="text-sm text-ink-2 mb-6">{t('auth.googleOnly')}</p>

          {displayError && (
            <p className="text-error text-sm mb-4" role="alert">
              {displayError}
            </p>
          )}

          <div ref={buttonHostRef} className="sr-only" aria-hidden="true" />
          <button
            type="button"
            onClick={signIn}
            disabled={configured && !ready}
            className="btn-primary w-full flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <GoogleIcon />
            {t('auth.google')}
          </button>

          <p className="text-xs text-ink-3 mt-5 text-center">
            {t('auth.termsConsent')}{' '}
            <Link href="/terms" className="text-accent hover:underline">
              {t('auth.termsLink')}
            </Link>{' '}
            {t('auth.and')}{' '}
            <Link href="/privacy" className="text-accent hover:underline">
              {t('auth.privacyLink')}
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.836.859-3.048.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.963 10.703A5.41 5.41 0 0 1 3.682 9c0-.591.101-1.165.281-1.703V4.965H.956A9 9 0 0 0 0 9c0 1.45.347 2.824.956 4.035l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.583c1.321 0 2.507.454 3.44 1.345l2.581-2.581C13.463.892 11.427 0 9 0A9 9 0 0 0 .956 4.965l3.007 2.332C4.672 5.168 6.656 3.583 9 3.583z"
        fill="#EA4335"
      />
    </svg>
  );
}
