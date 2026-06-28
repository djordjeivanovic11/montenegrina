'use client';

import Link from 'next/link';

import { MarketingFooter, MarketingHeader, useMarketingLocale } from '../components/marketing/marketing-shell';
import { useI18n } from '../lib/i18n/index';

const USE_CASES = [
  { title: 'Customer support', titleCnr: 'Korisnička podrška' },
  { title: 'Government', titleCnr: 'Državna uprava' },
  { title: 'Banking', titleCnr: 'Bankarstvo' },
  { title: 'Tourism', titleCnr: 'Turizam' },
];

const FAQ = [
  { q: 'Does Montenegrina support Montenegrin?', qCnr: 'Da li Montenegrina podržava crnogorski?', a: 'Yes — native Montenegrin voice and text.', aCnr: 'Da — izvorni crnogorski glas i tekst.' },
  { q: 'Can I deploy on-prem?', qCnr: 'Mogu li on-prem implementaciju?', a: 'Enterprise plans include self-hosted deployment.', aCnr: 'Enterprise planovi uključuju self-hosted implementaciju.' },
  { q: 'How is knowledge secured?', qCnr: 'Kako je znanje zaštićeno?', a: 'Access groups and tenant isolation per organization.', aCnr: 'Grupe pristupa i izolacija po organizaciji.' },
];

export function MarketingHome() {
  const [locale, setLocale] = useMarketingLocale();
  const { t } = useI18n(locale);
  const isEn = locale === 'en';

  return (
    <div className="marketing-page">
      <MarketingHeader locale={locale} onLocaleChange={setLocale} />

      <section className="marketing-hero">
        <div className="marketing-container">
          <div className="max-w-2xl animate-fade-in">
            <p className="eyebrow">Montenegrina</p>
            <h1 className="hero-title">{t('marketing.heroTitle')}</h1>
            <p className="hero-subtitle">{t('marketing.heroSubtitle')}</p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link href="/signup" className="btn-primary">{t('marketing.heroCta')}</Link>
              <a href="#pricing" className="btn-secondary">{t('marketing.heroSecondary')}</a>
            </div>
          </div>
        </div>
      </section>

      <section id="use-cases" className="marketing-section">
        <div className="marketing-container">
          <h2 className="section-title">{t('marketing.useCasesTitle')}</h2>
          <p className="section-subtitle">{t('marketing.useCasesSubtitle')}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
            {USE_CASES.map((item) => (
              <div key={item.title} className="feature-card">
                <h3 className="text-sm font-semibold text-ink">{isEn ? item.title : item.titleCnr}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="marketing-section marketing-section-alt">
        <div className="marketing-container">
          <h2 className="section-title">{t('marketing.howTitle')}</h2>
          <div className="grid md:grid-cols-3 gap-6 mt-10">
            {[1, 2, 3].map((step) => (
              <div key={step} className="step-card">
                <span className="step-number">{step}</span>
                <h3 className="text-sm font-semibold text-ink mt-4">{t(`marketing.howStep${step}` as 'marketing.howStep1')}</h3>
                <p className="text-sm text-ink-2 mt-2">{t(`marketing.howStep${step}Desc` as 'marketing.howStep1Desc')}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="knowledge" className="marketing-section">
        <div className="marketing-container grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="section-title">{t('marketing.knowledgeTitle')}</h2>
            <p className="section-subtitle mt-4">{t('marketing.knowledgeDesc')}</p>
          </div>
          <div className="feature-card h-48 flex items-center justify-center text-ink-3 text-sm">RAG pipeline</div>
        </div>
      </section>

      <section id="security" className="marketing-section marketing-section-alt">
        <div className="marketing-container grid lg:grid-cols-2 gap-10 items-center">
          <div className="feature-card h-48 flex items-center justify-center text-ink-3 text-sm order-2 lg:order-1">Security</div>
          <div className="order-1 lg:order-2">
            <h2 className="section-title">{t('marketing.securityTitle')}</h2>
            <p className="section-subtitle mt-4">{t('marketing.securityDesc')}</p>
          </div>
        </div>
      </section>

      <section id="deployment" className="marketing-section">
        <div className="marketing-container">
          <h2 className="section-title">{t('marketing.deploymentTitle')}</h2>
          <p className="section-subtitle mt-4 max-w-2xl">{t('marketing.deploymentDesc')}</p>
        </div>
      </section>

      <section id="pricing" className="marketing-section marketing-section-alt">
        <div className="marketing-container">
          <h2 className="section-title">{t('marketing.pricingTitle')}</h2>
          <p className="section-subtitle">{t('marketing.pricingSubtitle')}</p>
          <div className="grid md:grid-cols-3 gap-4 mt-10">
            {['Starter', 'Pro', 'Enterprise'].map((plan) => (
              <div key={plan} className="pricing-card">
                <h3 className="text-sm font-semibold">{plan}</h3>
                <p className="text-2xl font-semibold mt-4 text-ink">{plan === 'Enterprise' ? 'Custom' : plan === 'Pro' ? '€99' : 'Free'}</p>
                <Link href="/signup" className="btn-secondary w-full mt-6 text-center block">{t('nav.getStarted')}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="marketing-section">
        <div className="marketing-container max-w-2xl">
          <h2 className="section-title">{t('marketing.faqTitle')}</h2>
          <div className="mt-8 space-y-4">
            {FAQ.map((item) => (
              <details key={item.q} className="faq-item">
                <summary>{isEn ? item.q : item.qCnr}</summary>
                <p>{isEn ? item.a : item.aCnr}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-cta">
        <div className="marketing-container text-center">
          <h2 className="section-title">{t('marketing.ctaTitle')}</h2>
          <p className="section-subtitle mt-3">{t('marketing.ctaSubtitle')}</p>
          <Link href="/signup" className="btn-primary inline-flex mt-8">{t('nav.getStarted')}</Link>
        </div>
      </section>

      <MarketingFooter locale={locale} />
    </div>
  );
}
