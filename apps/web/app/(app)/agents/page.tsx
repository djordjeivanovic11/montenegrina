'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Badge, Card, EmptyState, PageHeader } from '../../components/ui/page-shell';
import { api } from '../../lib/api-client';
import { useI18n } from '../../lib/i18n/index';

type Agent = { id: string; name: string; slug: string; status?: string };

export default function AgentsPage() {
  const { t } = useI18n('cnr');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await api.GET('/v1/agents');
      if (res.data) setAgents(res.data.items);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="page-content">
      <PageHeader title={t('nav.agents')} description="Manage voice and chat agents." />
      {loading ? (
        <p className="text-sm text-ink-2">{t('app.loading')}</p>
      ) : agents.length === 0 ? (
        <EmptyState title="No agents yet" description="Complete onboarding to create your first agent." action={<Link href="/onboarding" className="btn-primary text-sm">{t('onboarding.title')}</Link>} />
      ) : (
        <div className="grid gap-3 mt-6">
          {agents.map((agent) => (
            <Link key={agent.id} href={`/agents/${agent.id}`}>
              <Card className="p-4 hover:border-border-2 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">{agent.name}</p>
                    <p className="text-xs text-ink-3 mt-0.5">{agent.slug}</p>
                  </div>
                  <Badge>{agent.status ?? 'DRAFT'}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
