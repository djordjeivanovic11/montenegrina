'use client';

import { Badge, Card, PageHeader } from '../../components/ui/page-shell';
import { useI18n } from '../../lib/i18n/index';

export default function IntegrationsPage() {
  const { t } = useI18n('cnr');

  return (
    <div className="page-content">
      <PageHeader title={t('integrations.title')} description="Connect Montenegrina to your channels." />
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">{t('integrations.browserTitle')}</h3>
              <p className="text-sm text-ink-2 mt-2">{t('integrations.browserDesc')}</p>
            </div>
            <Badge variant="success">{t('app.active')}</Badge>
          </div>
          <pre className="mt-4 p-3 rounded-lg bg-surface-2 text-xs text-ink-2 overflow-x-auto">
            {`<script src="https://cdn.montenegrina.ai/widget.js" data-org="YOUR_ORG_ID"></script>`}
          </pre>
        </Card>
        <Card className="p-5 opacity-80">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">{t('integrations.phoneTitle')}</h3>
              <p className="text-sm text-ink-2 mt-2">{t('integrations.phoneDesc')}</p>
            </div>
            <Badge variant="muted">{t('app.comingSoon')}</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}
