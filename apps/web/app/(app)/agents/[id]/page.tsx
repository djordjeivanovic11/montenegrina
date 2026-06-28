'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Badge, Card, PageHeader } from '../../../components/ui/page-shell';
import { API_URL, api, apiHeaders } from '../../../lib/api-client';
import { buildOnboardingAgentConfig } from '../../../lib/onboarding-agent-config';

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const [agent, setAgent] = useState<Record<string, unknown> | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!params.id) return;
    const res = await api.GET('/v1/agents/{agentId}', { params: { path: { agentId: params.id } } });
    if (res.data) setAgent(res.data as Record<string, unknown>);
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function publishAgent(): Promise<void> {
    if (!params.id) return;
    setPublishing(true);
    setMessage('');
    try {
      let versionId = agent?.publishedVersionId as string | undefined;
      if (!versionId) {
        const basesRes = await fetch(`${API_URL}/v1/knowledge/bases`, { credentials: 'include', headers: apiHeaders() });
        let knowledgeBaseIds: string[] = [];
        if (basesRes.ok) {
          const data = (await basesRes.json()) as { items: Array<{ id: string }> };
          if (data.items[0]?.id) knowledgeBaseIds = [data.items[0].id];
        }
        const prompt = ((agent?.description as string) || 'You are a helpful Montenegrina assistant.').trim();
        const version = await api.POST('/v1/agents/{agentId}/versions', {
          params: { path: { agentId: params.id }, header: { 'Idempotency-Key': crypto.randomUUID() } },
          body: { config: buildOnboardingAgentConfig(prompt, knowledgeBaseIds) },
        });
        if (!version.response.ok || !version.data) {
          setMessage('Failed to create agent version.');
          return;
        }
        versionId = version.data.id;
      }
      const published = await api.POST('/v1/agents/{agentId}/publish', {
        params: { path: { agentId: params.id }, header: { 'Idempotency-Key': crypto.randomUUID() } },
        body: { versionId },
      });
      if (!published.response.ok) {
        setMessage('Failed to publish agent.');
        return;
      }
      setMessage('Agent published. Voice is now available in the playground.');
      await load();
    } finally {
      setPublishing(false);
    }
  }

  const isPublished = Boolean(agent?.publishedVersionId);

  return (
    <div className="page-content">
      <PageHeader
        title={(agent?.name as string) ?? 'Agent'}
        description={(agent?.slug as string) ?? ''}
        actions={
          <>
            {!isPublished && (
              <button type="button" onClick={() => void publishAgent()} className="btn-primary text-sm" disabled={publishing}>
                {publishing ? 'Publishing…' : 'Publish agent'}
              </button>
            )}
            <Link href="/playground" className="btn-secondary text-sm">Test in playground</Link>
            <Badge>{isPublished ? 'PUBLISHED' : 'DRAFT'}</Badge>
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
            <dd className="text-ink-2 mt-1 whitespace-pre-wrap">{(agent?.description as string) ?? '—'}</dd>
          </div>
        </dl>
        {message && <p className="text-sm text-ink-2 mt-4">{message}</p>}
      </Card>
      <Link href="/agents" className="inline-block mt-6 text-sm text-ink-2 hover:text-ink">← Back to agents</Link>
    </div>
  );
}
