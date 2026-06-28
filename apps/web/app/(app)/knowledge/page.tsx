'use client';

import { KnowledgeSection } from '../../components/knowledge/knowledge-section';
import { PageHeader } from '../../components/ui/page-shell';
import { API_URL, apiHeaders } from '../../lib/api-client';
import { useI18n } from '../../lib/i18n/index';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';

export default function KnowledgePage() {
  const { t } = useI18n('cnr');
  const [agentId, setAgentId] = useState('');

  useEffect(() => {
    void (async () => {
      const res = await api.GET('/v1/agents');
      if (res.data?.items[0]) setAgentId(res.data.items[0].id);
    })();
  }, []);

  return (
    <div className="page-content flex flex-col min-h-0 flex-1">
      <PageHeader title={t('nav.knowledge')} description="Upload documents and manage knowledge bases." />
      <div className="flex-1 min-h-0 mt-4 -mx-2">
        <KnowledgeSection apiUrl={API_URL} headers={apiHeaders} agentId={agentId} />
      </div>
    </div>
  );
}
