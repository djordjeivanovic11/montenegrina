'use client';

import { useEffect, useMemo, useState } from 'react';

import { Badge, Card, PageHeader } from '../../components/ui/page-shell';
import { API_URL, apiHeaders, errorMessage } from '../../lib/api-client';
import { useI18n } from '../../lib/i18n/index';
import { useSession } from '../../lib/hooks/use-session';
import { useWorkspace } from '../../lib/hooks/use-workspace';

type PhoneNumber = {
  id: string;
  e164: string;
  label: string;
  inboundAgentId: string | null;
  enabled: boolean;
  callerIdE164: string | null;
};

type Agent = { id: string; name: string };

type ChannelInfo = {
  phoneIntegrationsEnabled?: boolean;
  sipConfigured?: boolean;
  inboundConfigured?: boolean;
};

export default function IntegrationsPage() {
  const { t } = useI18n('cnr');
  const { csrfToken } = useSession();
  const { organizationId } = useWorkspace();
  const [phones, setPhones] = useState<PhoneNumber[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [channelInfo, setChannelInfo] = useState<ChannelInfo>({});
  const [error, setError] = useState('');
  const [form, setForm] = useState({ e164: '', label: '', inboundAgentId: '', enabled: true });
  const [saving, setSaving] = useState(false);

  const headers = useMemo(
    () => ({
      ...apiHeaders(),
      'Content-Type': 'application/json',
    }),
    [csrfToken, organizationId],
  );

  async function reload(): Promise<void> {
    const [phonesRes, agentsRes] = await Promise.all([
      fetch(`${API_URL}/v1/integrations/phone-numbers`, { headers: apiHeaders(), credentials: 'include' }),
      fetch(`${API_URL}/v1/agents`, { headers: apiHeaders(), credentials: 'include' }),
    ]);
    if (phonesRes.ok) {
      const data = (await phonesRes.json()) as {
        items: PhoneNumber[];
        phoneIntegrationsEnabled: boolean;
        sipConfigured: boolean;
        inboundConfigured: boolean;
      };
      setPhones(data.items);
      setChannelInfo((prev) => ({
        ...prev,
        phoneIntegrationsEnabled: data.phoneIntegrationsEnabled,
        sipConfigured: data.sipConfigured,
        inboundConfigured: data.inboundConfigured,
      }));
    }
    if (agentsRes.ok) {
      const data = (await agentsRes.json()) as { items: Agent[] };
      setAgents(data.items);
      if (data.items[0] && !form.inboundAgentId) {
        setForm((current) => ({ ...current, inboundAgentId: data.items[0]?.id ?? '' }));
      }
    }
  }

  useEffect(() => {
    if (!csrfToken || !organizationId) return;
    void (async () => {
      const channelsRes = await fetch(`${API_URL}/v1/integrations/channels`, {
        headers: apiHeaders(),
        credentials: 'include',
      });
      if (channelsRes.ok) {
        const data = (await channelsRes.json()) as { items: ChannelInfo[] };
        setChannelInfo((prev) => ({ ...prev, ...(data.items[0] ?? {}) }));
      }
      await reload();
    })();
  }, [csrfToken, organizationId]);

  async function addPhoneNumber(): Promise<void> {
    setSaving(true);
    setError('');
    const response = await fetch(`${API_URL}/v1/integrations/phone-numbers`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        e164: form.e164,
        label: form.label,
        inboundAgentId: form.inboundAgentId || undefined,
        enabled: form.enabled,
      }),
    });
    setSaving(false);
    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      setError(payload.error?.message ?? t('integrations.phoneSaveFailed'));
      return;
    }
    setForm({ e164: '', label: '', inboundAgentId: agents[0]?.id ?? '', enabled: true });
    await reload();
  }

  async function patchPhone(id: string, body: Record<string, unknown>): Promise<void> {
    setError('');
    const response = await fetch(`${API_URL}/v1/integrations/phone-numbers/${id}`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setError(errorMessage(await response.json()));
      return;
    }
    await reload();
  }

  async function deletePhone(id: string): Promise<void> {
    if (!window.confirm(t('integrations.deletePhoneConfirm'))) return;
    setError('');
    const response = await fetch(`${API_URL}/v1/integrations/phone-numbers/${id}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });
    if (!response.ok) {
      setError(errorMessage(await response.json()));
      return;
    }
    await reload();
  }

  const phoneEnabled = channelInfo.phoneIntegrationsEnabled === true;

  return (
    <div className="page-content">
      <PageHeader title={t('integrations.title')} description={t('integrations.pageDesc')} />
      {error && <p className="text-error text-sm mt-4">{error}</p>}
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
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">{t('integrations.phoneTitle')}</h3>
              <p className="text-sm text-ink-2 mt-2">{t('integrations.phoneDesc')}</p>
            </div>
            <Badge variant={phoneEnabled ? 'success' : 'muted'}>
              {phoneEnabled ? t('app.active') : t('app.comingSoon')}
            </Badge>
          </div>
          {phoneEnabled ? (
            <div className="mt-4 space-y-4">
              <ul className="text-xs text-ink-2 space-y-1">
                <li>{channelInfo.sipConfigured ? t('integrations.sipOutboundReady') : t('integrations.sipOutboundMissing')}</li>
                <li>{channelInfo.inboundConfigured ? t('integrations.sipInboundReady') : t('integrations.sipInboundMissing')}</li>
              </ul>
              {phones.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-ink-3 border-b border-border">
                        <th className="py-2 pr-3">{t('integrations.phoneNumber')}</th>
                        <th className="py-2 pr-3">{t('integrations.inboundAgent')}</th>
                        <th className="py-2 pr-3">{t('integrations.phoneEnabled')}</th>
                        <th className="py-2">{t('integrations.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phones.map((phone) => (
                        <tr key={phone.id} className="border-b border-border/60">
                          <td className="py-2 pr-3">
                            <div className="font-mono text-xs">{phone.e164}</div>
                            <div className="text-xs text-ink-3">{phone.label || '—'}</div>
                          </td>
                          <td className="py-2 pr-3">
                            <select
                              className="input text-xs"
                              value={phone.inboundAgentId ?? ''}
                              onChange={(event) =>
                                void patchPhone(phone.id, {
                                  inboundAgentId: event.target.value || null,
                                  enabled: phone.enabled,
                                })
                              }
                            >
                              <option value="">{t('integrations.noAgent')}</option>
                              {agents.map((agent) => (
                                <option key={agent.id} value={agent.id}>{agent.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="checkbox"
                              checked={phone.enabled}
                              onChange={(event) =>
                                void patchPhone(phone.id, { enabled: event.target.checked })
                              }
                            />
                          </td>
                          <td className="py-2">
                            <button
                              type="button"
                              className="text-xs text-error hover:underline"
                              onClick={() => void deletePhone(phone.id)}
                            >
                              {t('integrations.deletePhone')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="grid gap-2">
                <input
                  className="input"
                  placeholder={t('integrations.phoneE164Placeholder')}
                  value={form.e164}
                  onChange={(event) => setForm((current) => ({ ...current, e164: event.target.value }))}
                />
                <input
                  className="input"
                  placeholder={t('integrations.phoneLabelPlaceholder')}
                  value={form.label}
                  onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                />
                <select
                  className="input"
                  value={form.inboundAgentId}
                  onChange={(event) => setForm((current) => ({ ...current, inboundAgentId: event.target.value }))}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
                <button type="button" className="btn btn-primary text-sm" disabled={saving || !form.e164} onClick={() => void addPhoneNumber()}>
                  {t('integrations.addPhoneNumber')}
                </button>
              </div>
              <p className="text-xs text-ink-3">{t('integrations.phoneSetupHint')}</p>
            </div>
          ) : (
            <p className="text-sm text-ink-3 mt-4">{t('integrations.phoneDisabledHint')}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
