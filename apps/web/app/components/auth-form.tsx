'use client';

import Link from 'next/link';
import { type FormEvent } from 'react';

import { LogoMark } from './app-sidebar';
import { useGoogleSignIn } from '../lib/hooks/use-google-sign-in';
import { useI18n, type Locale } from '../lib/i18n/index';
import { TurnstileWidget } from './turnstile-widget';

interface AuthFormProps {
  mode: 'login' | 'signup';
  locale?: Locale;
  email: string;
  password: string;
  displayName?: string;
  error: string;
  notice?: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onDisplayNameChange?: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onGoogleLogin: (credential: string) => void;
  onTurnstileTokenChange?: (token: string) => void;
}

export function AuthForm({
  mode,
  locale = 'cnr',
  email,
  password,
  displayName = '',
  error,
  notice = '',
  onEmailChange,
  onPasswordChange,
  onDisplayNameChange,
  onSubmit,
  onGoogleLogin,
  onTurnstileTokenChange,
}: AuthFormProps) {
  const { t } = useI18n(locale);
  const { signIn, buttonHostRef, ready, configured, loadError } = useGoogleSignIn(onGoogleLogin);
  const googleError = loadError ? t(`auth.${loadError}`) : '';
  const displayError = error || googleError;

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
          <h1 className="text-lg font-semibold text-ink mb-6">
            {mode === 'login' ? t('auth.loginTitle') : t('auth.signupTitle')}
          </h1>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {mode === 'signup' && onDisplayNameChange && (
              <label className="field-label">
                {t('auth.displayName')}
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => onDisplayNameChange(e.target.value)}
                  required
                  className="input-field"
                />
              </label>
            )}
            <label className="field-label">
              {t('auth.email')}
              <input
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                autoComplete="email"
                required
                className="input-field"
              />
            </label>
            <label className="field-label">
              {t('auth.password')}
              <input
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={12}
                className="input-field"
              />
            </label>

            {mode === 'login' && (
              <p className="text-sm text-right -mt-2">
                <Link href="/forgot-password" className="text-accent hover:underline">
                  {t('auth.forgotPassword')}
                </Link>
              </p>
            )}

            {displayError && (
              <p className="text-error text-sm" role="alert">
                {displayError}
              </p>
            )}

            {notice && (
              <p className="text-sm text-success" role="status">
                {notice}
              </p>
            )}

            {mode === 'signup' && onTurnstileTokenChange && (
              <TurnstileWidget onToken={onTurnstileTokenChange} />
            )}

            <button type="submit" className="btn-primary w-full mt-1">
              {mode === 'login' ? t('auth.submitLogin') : t('auth.submitSignup')}
            </button>
          </form>

          {mode === 'signup' && (
            <p className="text-xs text-ink-3 mt-4 text-center">
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
          )}

          <div className="divider my-4">{t('auth.or')}</div>

          <div ref={buttonHostRef} className="sr-only" aria-hidden="true" />

          <button
            type="button"
            onClick={signIn}
            disabled={configured && !ready}
            className="btn-secondary w-full flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <GoogleIcon />
            {t('auth.google')}
          </button>

          <p className="text-sm text-ink-2 text-center mt-6">
            {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}{' '}
            <Link
              href={mode === 'login' ? '/signup' : '/login'}
              className="text-accent hover:underline"
            >
              {mode === 'login' ? t('auth.signupLink') : t('auth.loginLink')}
            </Link>
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
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
