'use client';

import { useEffect, useState } from 'react';

import { Card, PageHeader } from '../../components/ui/page-shell';
import { API_URL, api, apiHeaders } from '../../lib/api-client';
import { useI18n } from '../../lib/i18n/index';

type UsageItem = { metric: string; current: number; limit: number | null; period: string };

export default function UsagePage() {
  const { t } = useI18n('cnr');
  const [usage, setUsage] = useState<UsageItem[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`${API_URL}/v1/billing/usage-summary`, {
        credentials: 'include',
        headers: apiHeaders(),
      });
      if (res.ok) {
        const data = (await res.json()) as { usage: UsageItem[] };
        setUsage(data.usage ?? []);
      }
    })();
  }, []);

  return (
    <div className="page-content">
      <PageHeader title={t('nav.usage')} description="Monitor consumption against your plan limits." />
      <div className="grid gap-3 mt-6">
        {usage.map((item) => (
          <Card key={item.metric} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{item.metric.replace(/_/g, ' ')}</span>
              <span className="text-sm text-ink-2">
                {item.current}{item.limit != null ? ` / ${item.limit}` : ''}
              </span>
            </div>
            {item.limit != null && (
              <div className="usage-bar">
                <div className="usage-bar-fill" style={{ width: `${Math.min(100, (item.current / item.limit) * 100)}%` }} />
              </div>
            )}
          </Card>
        ))}
        {usage.length === 0 && <p className="text-sm text-ink-2">{t('app.loading')}</p>}
      </div>
    </div>
  );
}
