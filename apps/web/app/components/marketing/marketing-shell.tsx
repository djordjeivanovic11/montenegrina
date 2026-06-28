'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { LogoMark } from '../app-sidebar';
import { getStoredLocale, storeLocale, useI18n, type Locale } from '../../lib/i18n/index';

interface MarketingHeaderProps {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}

export function MarketingHeader({ locale, onLocaleChange }: MarketingHeaderProps) {
  const { t } = useI18n(locale);

  return (
    <header className="marketing-header">
      <div className="marketing-container flex items-center justify-between h-14">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-sm font-semibold text-ink">Montenegrina</span>
        </Link>
        <div className="flex items-center gap-3">
          <LocaleToggle locale={locale} onChange={onLocaleChange} />
          <Link href="/login" className="btn-ghost text-sm">
            {t('nav.login')}
          </Link>
          <Link href="/signup" className="btn-primary text-sm">
            {t('nav.getStarted')}
          </Link>
        </div>
      </div>
    </header>
  );
}

function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  return (
    <div className="locale-toggle" role="group" aria-label="Language">
      {(['en', 'cnr'] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          className={locale === code ? 'locale-toggle-active' : ''}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function useMarketingLocale(): [Locale, (l: Locale) => void] {
  const [locale, setLocale] = useState<Locale>('cnr');
  useEffect(() => setLocale(getStoredLocale()), []);
  const change = (next: Locale) => {
    setLocale(next);
    storeLocale(next);
  };
  return [locale, change];
}

export function MarketingFooter({ locale }: { locale: Locale }) {
  const { t } = useI18n(locale);
  return (
    <footer className="marketing-footer">
      <div className="marketing-container py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <LogoMark />
          <span className="text-sm text-ink-2">© {new Date().getFullYear()} Montenegrina</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-ink-2">
          <Link href="/terms">{t('marketing.terms')}</Link>
          <Link href="/privacy">{t('marketing.privacy')}</Link>
          <Link href="/login">{t('nav.login')}</Link>
          <Link href="/signup">{t('nav.signup')}</Link>
        </div>
      </div>
    </footer>
  );
}
