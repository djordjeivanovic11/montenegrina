'use client';

import { useEffect, useState } from 'react';

import { KnowledgeSection } from '../../components/knowledge/knowledge-section';
import { API_URL, api, apiHeaders } from '../../lib/api-client';
import { useI18n } from '../../lib/i18n/index';

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
    <div className="page-content-fill">
      <div className="shrink-0 mb-3">
        <h1 className="page-title">{t('nav.knowledge')}</h1>
        <p className="page-description">Učitajte dokumente i upravljajte bazama znanja.</p>
      </div>
      <div className="flex-1 min-h-0">
        <KnowledgeSection apiUrl={API_URL} headers={apiHeaders} agentId={agentId} />
      </div>
    </div>
  );
}
