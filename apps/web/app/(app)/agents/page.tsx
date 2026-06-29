'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Badge, Card, EmptyState, PageHeader } from '../../components/ui/page-shell';
import { archiveAgent, publishAgentVersion, uniqueAgentSlug, type AgentRecord } from '../../lib/agent-actions';
import { api, parseApiError, quotaErrorKey } from '../../lib/api-client';
import { useI18n } from '../../lib/i18n/index';

export default function AgentsPage() {
  const router = useRouter();
  const { t } = useI18n('cnr');
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('You are a helpful Montenegrina assistant.');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function loadAgents(): Promise<void> {
    const res = await api.GET('/v1/agents');
    if (res.data) setAgents(res.data.items as AgentRecord[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadAgents();
  }, []);

  async function createAgent(event: FormEvent): Promise<void> {
    event.preventDefault();
    setCreating(true);
    setError('');
    const trimmedName = name.trim();
    const trimmedInstructions = instructions.trim();
    if (!trimmedName || !trimmedInstructions) {
      setError(t('agents.requiredFields'));
      setCreating(false);
      return;
    }

    const created = await api.POST('/v1/agents', {
      params: { header: { 'Idempotency-Key': crypto.randomUUID() } },
      body: {
        name: trimmedName,
        slug: uniqueAgentSlug(trimmedName),
        description: trimmedInstructions,
      },
    });
    if (!created.response.ok || !created.data?.id) {
      const parsed = parseApiError(created.error);
      if (parsed.code === 'QUOTA_EXCEEDED' && parsed.details) {
        setError(
          t('quota.exceeded', {
            metric: t(quotaErrorKey(parsed.details.metric)),
            current: String(parsed.details.current),
            limit: String(parsed.details.limit),
          }),
        );
      } else {
        setError(parsed.message || t('agents.createFailed'));
      }
      setCreating(false);
      return;
    }

    const published = await publishAgentVersion(created.data.id, trimmedInstructions);
    if (!published.ok) {
      setError(published.message ?? t('agents.publishFailed'));
      setCreating(false);
      return;
    }

    setShowCreate(false);
    setName('');
    setInstructions('You are a helpful Montenegrina assistant.');
    router.push(`/agents/${created.data.id}`);
  }

  async function removeAgent(agentId: string, agentName: string): Promise<void> {
    if (!window.confirm(t('agents.deleteConfirm', { name: agentName }))) return;
    const ok = await archiveAgent(agentId);
    if (!ok) {
      setError(t('agents.deleteFailed'));
      return;
    }
    await loadAgents();
  }

  return (
    <div className="page-content">
      <PageHeader
        title={t('nav.agents')}
        description={t('agents.pageDesc')}
        actions={
          <button type="button" onClick={() => setShowCreate((value) => !value)} className="btn-primary text-sm">
            {t('agents.newAgent')}
          </button>
        }
      />

      {showCreate && (
        <Card className="p-5 mt-6">
          <h2 className="text-sm font-semibold text-ink">{t('agents.newAgent')}</h2>
          <form onSubmit={(e) => void createAgent(e)} className="mt-4 space-y-4">
            <label className="field-label block">
              {t('agents.name')}
              <input value={name} onChange={(e) => setName(e.target.value)} className="input-field mt-1" required />
            </label>
            <label className="field-label block">
              {t('agents.instructions')}
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={5}
                className="input-field mt-1 resize-none"
                required
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary text-sm" disabled={creating}>
                {creating ? t('agents.creating') : t('agents.create')}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary text-sm" disabled={creating}>
                {t('app.cancel')}
              </button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-ink-2 mt-6">{t('app.loading')}</p>
      ) : agents.length === 0 ? (
        <EmptyState
          title={t('agents.emptyTitle')}
          description={t('agents.emptyDesc')}
          action={
            <button type="button" onClick={() => setShowCreate(true)} className="btn-primary text-sm">
              {t('agents.newAgent')}
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 mt-6">
          {agents.map((agent) => (
            <Card key={agent.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <Link href={`/agents/${agent.id}`} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                  <p className="text-sm font-medium text-ink">{agent.name}</p>
                  <p className="text-xs text-ink-3 mt-0.5">{agent.slug}</p>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={agent.publishedVersionId ? 'success' : 'muted'}>
                    {agent.publishedVersionId ? t('agents.published') : t('agents.draft')}
                  </Badge>
                  <Link href={`/agents/${agent.id}`} className="btn-secondary text-xs">
                    {t('agents.edit')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => void removeAgent(agent.id, agent.name)}
                    className="btn-secondary text-xs text-red-600"
                  >
                    {t('agents.delete')}
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
