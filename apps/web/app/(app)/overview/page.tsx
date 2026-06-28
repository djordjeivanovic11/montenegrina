'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Badge, Card, PageHeader } from '../../components/ui/page-shell';
import { api, API_URL, apiHeaders } from '../../lib/api-client';
import { useI18n } from '../../lib/i18n/index';
import { useSession } from '../../lib/hooks/use-session';
import { useWorkspace } from '../../lib/hooks/use-workspace';

export default function OverviewPage() {
  const { t } = useI18n('cnr');
  const { user } = useSession();
  const { organization } = useWorkspace();
  const [stats, setStats] = useState({ agents: 0, conversations: 0, documents: 0 });

  useEffect(() => {
    void (async () => {
      const [agentsRes, convRes] = await Promise.all([
        api.GET('/v1/agents'),
        fetch(`${API_URL}/v1/conversations`, { credentials: 'include', headers: apiHeaders() }),
      ]);
      const agents = agentsRes.data?.items.length ?? 0;
      const convData = convRes.ok ? ((await convRes.json()) as { items: unknown[] }) : { items: [] };
      setStats({ agents, conversations: convData.items.length, documents: 0 });
    })();
  }, []);

  return (
    <div className="page-content">
      <PageHeader
        title={`${t('app.welcome')}, ${user?.displayName ?? user?.email ?? ''}`}
        description={organization?.name}
        actions={<Link href="/playground" className="btn-primary text-sm">{t('nav.playground')}</Link>}
      />
      <div className="grid sm:grid-cols-3 gap-4 mt-8">
        <Card className="p-5">
          <p className="text-xs text-ink-3 uppercase tracking-wide">{t('nav.agents')}</p>
          <p className="text-2xl font-semibold mt-2">{stats.agents}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-ink-3 uppercase tracking-wide">{t('nav.conversations')}</p>
          <p className="text-2xl font-semibold mt-2">{stats.conversations}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-ink-3 uppercase tracking-wide">{t('nav.knowledge')}</p>
          <p className="text-2xl font-semibold mt-2">{stats.documents}</p>
        </Card>
      </div>
      {!organization?.onboarding.isComplete && (
        <Card className="p-5 mt-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t('onboarding.title')}</p>
            <p className="text-sm text-ink-2 mt-1">Complete setup to publish your first agent.</p>
          </div>
          <Link href="/onboarding" className="btn-primary text-sm">{t('app.continue')}</Link>
        </Card>
      )}
      <div className="mt-6">
        <Badge variant="success">{organization?.role ?? 'MEMBER'}</Badge>
      </div>
    </div>
  );
}
