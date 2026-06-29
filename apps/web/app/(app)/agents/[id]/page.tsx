'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { Badge, Card, PageHeader } from '../../../components/ui/page-shell';
import { archiveAgent, publishAgentVersion, type AgentRecord } from '../../../lib/agent-actions';
import { api } from '../../../lib/api-client';
import { useI18n } from '../../../lib/i18n/index';

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n('cnr');
  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [loadedInstructions, setLoadedInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!params.id) return;
    const res = await api.GET('/v1/agents/{agentId}', { params: { path: { agentId: params.id } } });
    if (!res.data) return;
    const record = res.data as AgentRecord;
    setAgent(record);
    const prompt = record.config?.systemPrompt ?? record.description ?? '';
    setName(record.name);
    setInstructions(prompt);
    setLoadedInstructions(prompt);
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAgent(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!params.id) return;
    setSaving(true);
    setMessage('');
    setError('');

    const trimmedName = name.trim();
    const trimmedInstructions = instructions.trim();
    if (!trimmedName || !trimmedInstructions) {
      setError(t('agents.requiredFields'));
      setSaving(false);
      return;
    }

    const updated = await api.PATCH('/v1/agents/{agentId}', {
      params: { path: { agentId: params.id }, header: { 'Idempotency-Key': crypto.randomUUID() } },
      body: { name: trimmedName, description: trimmedInstructions },
    });
    if (!updated.response.ok) {
      setError(t('agents.saveFailed'));
      setSaving(false);
      return;
    }

    if (trimmedInstructions !== loadedInstructions) {
      const published = await publishAgentVersion(params.id, trimmedInstructions, agent?.config);
      if (!published.ok) {
        setError(published.message ?? t('agents.publishFailed'));
        setSaving(false);
        return;
      }
      setMessage(t('agents.savedAndPublished'));
    } else {
      setMessage(t('agents.saved'));
    }

    await load();
    setSaving(false);
  }

  async function publishDraft(): Promise<void> {
    if (!params.id) return;
    setPublishing(true);
    setMessage('');
    setError('');
    const prompt = instructions.trim() || loadedInstructions;
    if (!prompt) {
      setError(t('agents.requiredFields'));
      setPublishing(false);
      return;
    }
    const published = await publishAgentVersion(params.id, prompt, agent?.config);
    if (!published.ok) {
      setError(published.message ?? t('agents.publishFailed'));
      setPublishing(false);
      return;
    }
    setMessage(t('agents.publishedSuccess'));
    await load();
    setPublishing(false);
  }

  async function deleteAgent(): Promise<void> {
    if (!params.id || !agent) return;
    if (!window.confirm(t('agents.deleteConfirm', { name: agent.name }))) return;
    setDeleting(true);
    setError('');
    const ok = await archiveAgent(params.id);
    if (!ok) {
      setError(t('agents.deleteFailed'));
      setDeleting(false);
      return;
    }
    router.push('/agents');
  }

  const isPublished = Boolean(agent?.publishedVersionId);

  return (
    <div className="page-content">
      <PageHeader
        title={agent?.name ?? t('agents.edit')}
        description={agent?.slug ?? ''}
        actions={
          <>
            <Badge variant={isPublished ? 'success' : 'muted'}>
              {isPublished ? t('agents.published') : t('agents.draft')}
            </Badge>
            <Link href="/playground" className="btn-secondary text-sm">{t('agents.testPlayground')}</Link>
          </>
        }
      />

      <Card className="p-5 mt-6">
        <form onSubmit={(e) => void saveAgent(e)} className="space-y-4">
          <label className="field-label block">
            {t('agents.name')}
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-field mt-1" required />
          </label>
          <label className="field-label block">
            {t('agents.instructions')}
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={8}
              className="input-field mt-1 resize-none"
              required
            />
          </label>
          <p className="text-xs text-ink-3">{t('agents.instructionsHint')}</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-ink-2">{message}</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            <button type="submit" className="btn-primary text-sm" disabled={saving || publishing || deleting}>
              {saving ? t('agents.saving') : t('app.save')}
            </button>
            {!isPublished && (
              <button
                type="button"
                onClick={() => void publishDraft()}
                className="btn-secondary text-sm"
                disabled={saving || publishing || deleting}
              >
                {publishing ? t('agents.publishing') : t('agents.publish')}
              </button>
            )}
            <button
              type="button"
              onClick={() => void deleteAgent()}
              className="btn-secondary text-sm text-red-600"
              disabled={saving || publishing || deleting}
            >
              {deleting ? t('agents.deleting') : t('agents.delete')}
            </button>
          </div>
        </form>
      </Card>

      <Link href="/agents" className="inline-block mt-6 text-sm text-ink-2 hover:text-ink">
        ← {t('agents.backToList')}
      </Link>
    </div>
  );
}
