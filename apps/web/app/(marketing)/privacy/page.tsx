'use client';

import Link from 'next/link';

import { MarketingFooter, MarketingHeader, useMarketingLocale } from '../../components/marketing/marketing-shell';
import { useI18n } from '../../lib/i18n/index';

export default function PrivacyPage() {
  const [locale, setLocale] = useMarketingLocale();
  const { t } = useI18n(locale);

  return (
    <div className="marketing-page">
      <MarketingHeader locale={locale} onLocaleChange={setLocale} />
      <main className="marketing-container py-16 max-w-3xl">
        <h1 className="text-3xl font-semibold text-ink mb-2">{t('legal.privacyTitle')}</h1>
        <p className="text-sm text-ink-3 mb-8">{t('legal.lastUpdated')}</p>

        <section className="prose-section space-y-6 text-ink-2 text-sm leading-relaxed">
          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">Data we collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Account information: email, display name, optional Google profile data</li>
              <li>Workspace content: agents, knowledge documents, conversation transcripts</li>
              <li>Usage metrics: API calls, voice minutes, token counts for billing and quotas</li>
              <li>Technical logs: request IDs, IP addresses, audit events for security</li>
            </ul>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">AI providers</h2>
            <p>
              To deliver voice and text capabilities we send prompts, transcripts, and document excerpts to configured
              providers (e.g. OpenAI, Deepgram, ElevenLabs). Do not upload data you cannot share with these processors.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">Retention</h2>
            <p>
              Conversation transcripts are retained for up to 30 days by default; audio artifacts up to 7 days. Audit
              logs are retained for up to 365 days. You may request workspace deletion from settings.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">Your rights</h2>
            <p>
              You may access, export, or delete workspace data subject to legal retention requirements. Contact us for
              data protection inquiries.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">Contact</h2>
            <p>
              Privacy inquiries:{' '}
              <a href={`mailto:${t('legal.contactEmail')}`} className="text-accent">
                {t('legal.contactEmail')}
              </a>
            </p>
          </div>
        </section>

        <p className="mt-10 text-sm">
          <Link href="/terms" className="text-accent hover:underline">
            {t('legal.termsTitle')}
          </Link>
        </p>
      </main>
      <MarketingFooter locale={locale} />
    </div>
  );
}
