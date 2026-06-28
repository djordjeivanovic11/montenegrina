'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Card, EmptyState, PageHeader } from '../../components/ui/page-shell';
import { API_URL, apiHeaders } from '../../lib/api-client';
import { useI18n } from '../../lib/i18n/index';

type Conversation = { id: string; startedAt: string; preview?: string; status?: string };

export default function ConversationsPage() {
  const { t } = useI18n('cnr');
  const [items, setItems] = useState<Conversation[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`${API_URL}/v1/conversations`, { credentials: 'include', headers: apiHeaders() });
      if (res.ok) {
        const data = (await res.json()) as { items: Conversation[] };
        setItems(data.items ?? []);
      }
    })();
  }, []);

  return (
    <div className="page-content">
      <PageHeader title={t('nav.conversations')} description="Review past agent conversations." actions={<Link href="/playground" className="btn-primary text-sm">New conversation</Link>} />
      {items.length === 0 ? (
        <EmptyState title="No conversations" description="Start a conversation in the playground." />
      ) : (
        <div className="grid gap-2 mt-6">
          {items.map((conv) => (
            <Card key={conv.id} className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{conv.preview ?? 'Conversation'}</p>
                  <p className="text-xs text-ink-3 mt-0.5">{new Date(conv.startedAt).toLocaleString()}</p>
                </div>
                <span className="text-xs text-ink-3 shrink-0">{conv.status ?? 'ACTIVE'}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
