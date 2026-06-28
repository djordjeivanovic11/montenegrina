'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Card, EmptyState, PageHeader } from '../../components/ui/page-shell';
import { API_URL, apiHeaders } from '../../lib/api-client';
import { useI18n } from '../../lib/i18n/index';

type Conversation = {
  id: string;
  agentId: string;
  channel?: string;
  startedAt: string;
  state?: string;
  calledE164?: string | null;
  callerE164?: string | null;
  hasRecording?: boolean;
};

export default function ConversationsPage() {
  const { t } = useI18n('cnr');
  const [items, setItems] = useState<Conversation[]>([]);
  const [loadingRecording, setLoadingRecording] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`${API_URL}/v1/conversations`, { credentials: 'include', headers: apiHeaders() });
      if (res.ok) {
        const data = (await res.json()) as { items: Conversation[] };
        setItems(data.items ?? []);
      }
    })();
  }, []);

  async function downloadRecording(conversationId: string): Promise<void> {
    setLoadingRecording(conversationId);
    const res = await fetch(`${API_URL}/v1/conversations/${conversationId}/recording`, {
      credentials: 'include',
      headers: apiHeaders(),
    });
    setLoadingRecording(null);
    if (!res.ok) return;
    const data = (await res.json()) as { url: string };
    window.open(data.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="page-content">
      <PageHeader
        title={t('nav.conversations')}
        description={t('conversations.pageDesc')}
        actions={
          <Link href="/playground" className="btn-primary text-sm">
            {t('conversations.newConversation')}
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState title={t('conversations.emptyTitle')} description={t('conversations.emptyDesc')} />
      ) : (
        <div className="grid gap-2 mt-6">
          {items.map((conv) => (
            <Card key={conv.id} className="p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {conv.channel === 'SIP'
                      ? `${t('conversations.sipCall')}${conv.calledE164 ? `: ${conv.calledE164}` : ''}`
                      : conv.channel ?? t('conversations.voice')}
                  </p>
                  <p className="text-xs text-ink-3 mt-0.5">{new Date(conv.startedAt).toLocaleString()}</p>
                  {conv.callerE164 && (
                    <p className="text-xs text-ink-3 mt-0.5">{t('conversations.from')}: {conv.callerE164}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-ink-3">{conv.state ?? 'ACTIVE'}</span>
                  {conv.hasRecording && (
                    <button
                      type="button"
                      className="btn btn-secondary text-xs"
                      disabled={loadingRecording === conv.id}
                      onClick={() => void downloadRecording(conv.id)}
                    >
                      {loadingRecording === conv.id ? t('conversations.loadingRecording') : t('conversations.downloadRecording')}
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
