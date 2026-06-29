'use client';

import Link from 'next/link';

import { MarketingFooter, MarketingHeader, useMarketingLocale } from '../components/marketing/marketing-shell';
import { useI18n } from '../lib/i18n/index';

export function MarketingHome() {
  const [locale, setLocale] = useMarketingLocale();
  const { t } = useI18n(locale);

  return (
    <div className="marketing-page">
      <MarketingHeader locale={locale} onLocaleChange={setLocale} />

      <section className="marketing-hero">
        <div className="marketing-container">
          <div className="marketing-hero-inner animate-fade-in">
            <p className="eyebrow">Montenegrina</p>
            <h1 className="hero-title">{t('marketing.heroTitle')}</h1>
            <p className="hero-subtitle">{t('marketing.heroSubtitle')}</p>
            <div className="mt-10">
              <Link href="/signup" className="btn-primary hero-cta">{t('nav.getStarted')}</Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter locale={locale} />
    </div>
  );
}
