'use client';

import { useEffect, type FormEvent } from 'react';

interface LoginPageProps {
  email: string;
  password: string;
  error: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onGoogleLogin: (credential: string) => void;
}

export function LoginPage({
  email,
  password,
  error,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onGoogleLogin,
}: LoginPageProps) {
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        onGoogleLogin(response.credential);
      },
    });
  }, [onGoogleLogin]);

  function onGoogleSignIn() {
    window.google?.accounts.id.prompt();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-8 h-8 flex items-center justify-center shrink-0">
              <svg width="32" height="32" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="28" height="28" rx="7" fill="var(--color-accent)" />
                <rect x="6" y="11" width="3" height="6" rx="1.5" fill="white" />
                <rect x="11" y="8" width="3" height="12" rx="1.5" fill="white" />
                <rect x="16" y="5" width="3" height="18" rx="1.5" fill="white" />
                <rect x="21" y="9" width="3" height="10" rx="1.5" fill="white" />
              </svg>
            </div>
            <span className="text-xl font-semibold text-ink">Montenegrina</span>
          </div>
          <p className="text-ink-3 text-sm">Glasovni AI za crnogorski jezik</p>
        </div>

        {/* Card */}
        <div
          className="rounded-xl p-8"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <h1 className="text-ink text-lg font-semibold mb-6">Prijavite se</h1>

          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-ink-2 text-xs font-medium uppercase tracking-wide">
                E-pošta
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                autoComplete="email"
                required
                className="w-full px-3 py-2.5 rounded-lg text-ink text-sm outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-ink)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-2)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-ink-2 text-xs font-medium uppercase tracking-wide">
                Lozinka
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full px-3 py-2.5 rounded-lg text-ink text-sm outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-ink)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-2)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                }}
              />
            </div>

            {error && (
              <p className="text-error text-sm" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-80 mt-1 cursor-pointer"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-fg)',
              }}
            >
              Prijavi se
            </button>
          </form>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
            <span className="text-xs" style={{ color: 'var(--color-ink-3)' }}>ili</span>
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
          </div>

          <button
            type="button"
            onClick={onGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer hover:opacity-90"
            style={{
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Nastavi s Googleom
          </button>
        </div>
      </div>
    </div>
  );
}
