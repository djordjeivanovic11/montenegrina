'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type GoogleSignInErrorKey = 'googleNotConfigured' | 'googleLoadFailed' | 'googleNotReady';

interface UseGoogleSignInResult {
  signIn: () => void;
  buttonHostRef: RefObject<HTMLDivElement | null>;
  ready: boolean;
  configured: boolean;
  loadError: GoogleSignInErrorKey | null;
}

export function useGoogleSignIn(onCredential: (credential: string) => void): UseGoogleSignInResult {
  const buttonHostRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  const initializedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<GoogleSignInErrorKey | null>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
  const configured = clientId.length > 0;

  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    initializedRef.current = false;
    setReady(false);

    if (!configured) {
      setLoadError(null);
      return;
    }

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const initialize = (): boolean => {
      if (cancelled || initializedRef.current) {
        return initializedRef.current;
      }
      if (!buttonHostRef.current || !window.google?.accounts?.id) {
        return false;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => callbackRef.current(response.credential),
      });

      buttonHostRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(buttonHostRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        width: 280,
      });

      initializedRef.current = true;
      setReady(true);
      setLoadError(null);
      return true;
    };

    if (!initialize()) {
      interval = setInterval(() => {
        if (initialize()) {
          clearInterval(interval);
        }
      }, 100);

      timeout = setTimeout(() => {
        if (!cancelled && !initializedRef.current) {
          setLoadError('googleLoadFailed');
        }
      }, 10000);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [clientId, configured]);

  const signIn = useCallback(() => {
    if (!configured) {
      setLoadError('googleNotConfigured');
      return;
    }

    const googleButton = buttonHostRef.current?.querySelector('[role="button"]') as HTMLElement | null;
    if (googleButton) {
      googleButton.click();
      return;
    }

    setLoadError('googleNotReady');
  }, [configured]);

  return { signIn, buttonHostRef, ready, configured, loadError };
}
