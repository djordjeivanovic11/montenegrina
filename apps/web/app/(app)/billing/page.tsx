'use client';

import { useEffect, useState } from 'react';

import { Badge, Card, PageHeader } from '../../components/ui/page-shell';
import { API_URL, api, apiHeaders } from '../../lib/api-client';
import { useI18n } from '../../lib/i18n/index';

type Plan = { id: string; slug: string; name: string; description: string | null; entitlements: Array<{ metric: string; limit: number; period: string }> };
type UsageItem = { metric: string; current: number; limit: number | null };

export default function BillingPage() {
  const { t } = useI18n('cnr');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<{ slug: string; name: string } | null>(null);
  const [usage, setUsage] = useState<UsageItem[]>([]);
  const [billingEnabled, setBillingEnabled] = useState(false);

  useEffect(() => {
    void (async () => {
      const [plansRes, usageRes] = await Promise.all([
        fetch(`${API_URL}/v1/billing/plans`),
        fetch(`${API_URL}/v1/billing/usage-summary`, { credentials: 'include', headers: apiHeaders() }),
      ]);
      if (plansRes.ok) {
        const data = (await plansRes.json()) as { items: Plan[]; billingEnabled: boolean };
        setPlans(data.items);
        setBillingEnabled(data.billingEnabled);
      }
      if (usageRes.ok) {
        const data = (await usageRes.json()) as { plan: { slug: string; name: string } | null; usage: UsageItem[] };
        setCurrentPlan(data.plan);
        setUsage(data.usage ?? []);
      }
    })();
  }, []);

  async function requestUpgrade(planSlug: string) {
    await fetch(`${API_URL}/v1/billing/upgrade-request`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ planSlug }),
    });
  }

  return (
    <div className="page-content">
      <PageHeader title={t('billing.title')} />
      <Card className="p-5 mt-6">
        <p className="text-xs text-ink-3 uppercase tracking-wide">{t('billing.currentPlan')}</p>
        <p className="text-lg font-semibold mt-1">{currentPlan?.name ?? t('billing.noPlan')}</p>
        {currentPlan && <Badge variant="success">{currentPlan.slug}</Badge>}
      </Card>

      <h2 className="text-sm font-semibold mt-8 mb-3">{t('billing.usage')}</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {usage.map((item) => (
          <Card key={item.metric} className="p-4">
            <p className="text-xs text-ink-3">{item.metric.replace(/_/g, ' ')}</p>
            <p className="text-lg font-semibold mt-1">{item.current}{item.limit != null ? ` / ${item.limit}` : ''}</p>
          </Card>
        ))}
      </div>

      <h2 className="text-sm font-semibold mt-8 mb-3">Available plans</h2>
      <div className="grid md:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <Card key={plan.id} className="p-5">
            <h3 className="text-sm font-semibold">{plan.name}</h3>
            <p className="text-sm text-ink-2 mt-2">{plan.description}</p>
            <ul className="mt-4 space-y-1 text-xs text-ink-2">
              {plan.entitlements.slice(0, 4).map((e) => (
                <li key={e.metric}>{e.metric}: {e.limit}</li>
              ))}
            </ul>
            <button type="button" onClick={() => void requestUpgrade(plan.slug)} className="btn-secondary w-full mt-4 text-sm">
              {billingEnabled ? t('billing.upgrade') : 'Contact sales'}
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
