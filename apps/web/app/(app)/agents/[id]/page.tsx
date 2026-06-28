'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Badge, Card, PageHeader } from '../../../components/ui/page-shell';
import { api } from '../../../lib/api-client';

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const [agent, setAgent] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!params.id) return;
    void (async () => {
      const res = await api.GET('/v1/agents/{agentId}', { params: { path: { agentId: params.id } } });
      if (res.data) setAgent(res.data as Record<string, unknown>);
    })();
  }, [params.id]);

  return (
    <div className="page-content">
      <PageHeader
        title={(agent?.name as string) ?? 'Agent'}
        description={(agent?.slug as string) ?? ''}
        actions={
          <>
            <Link href="/playground" className="btn-secondary text-sm">Test in playground</Link>
            <Badge>{(agent?.status as string) ?? 'DRAFT'}</Badge>
          </>
        }
      />
      <Card className="p-5 mt-6">
        <dl className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-ink-3">ID</dt>
            <dd className="text-ink mt-1 font-mono text-xs">{params.id}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Language</dt>
            <dd className="text-ink mt-1">{(agent?.defaultLanguage as string) ?? 'cnr'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-ink-3">Instructions</dt>
            <dd className="text-ink-2 mt-1 whitespace-pre-wrap">{(agent?.instructions as string) ?? '—'}</dd>
          </div>
        </dl>
      </Card>
      <Link href="/agents" className="inline-block mt-6 text-sm text-ink-2 hover:text-ink">← Back to agents</Link>
    </div>
  );
}
