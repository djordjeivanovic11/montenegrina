'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { API_URL, apiHeaders, parseApiError, quotaErrorKey } from '../../lib/api-client';
import { useI18n, type Locale } from '../../lib/i18n/index';

type UploadedDoc = {
  id: string;
  title: string;
  status: string;
};

interface KnowledgeUploadStepProps {
  locale?: Locale;
  agentId: string | null;
}

export function KnowledgeUploadStep({ locale = 'cnr', agentId }: KnowledgeUploadStepProps) {
  const { t } = useI18n(locale);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState('');
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const loadDocuments = useCallback(async (baseId: string) => {
    const response = await fetch(`${API_URL}/v1/knowledge/documents?knowledgeBaseId=${baseId}`, {
      headers: apiHeaders(),
      credentials: 'include',
    });
    if (!response.ok) return;
    const data = (await response.json()) as { items: UploadedDoc[] };
    setDocuments(data.items);
  }, []);

  useEffect(() => {
    void fetch(`${API_URL}/v1/knowledge/bases`, { headers: apiHeaders(), credentials: 'include' })
      .then((response) => response.json())
      .then((data: { items: Array<{ id: string }> }) => {
        const baseId = data.items[0]?.id;
        if (baseId) {
          setKnowledgeBaseId(baseId);
          void loadDocuments(baseId);
        }
      });
  }, [loadDocuments]);

  useEffect(() => {
    const pending = documents.filter((doc) => !['READY', 'FAILED'].includes(doc.status));
    if (!pending.length || !knowledgeBaseId) return;
    const timer = setInterval(() => void loadDocuments(knowledgeBaseId), 3000);
    return () => clearInterval(timer);
  }, [documents, knowledgeBaseId, loadDocuments]);

  async function assignToAgent(baseId: string) {
    if (!agentId) return;
    const existing = await fetch(`${API_URL}/v1/knowledge/bases/${baseId}/assignments`, {
      headers: apiHeaders(),
      credentials: 'include',
    });
    if (existing.ok) {
      const data = (await existing.json()) as { items: Array<{ agentId: string }> };
      if (data.items.some((item) => item.agentId === agentId)) return;
    }
    await fetch(`${API_URL}/v1/knowledge/bases/${baseId}/assignments`, {
      method: 'POST',
      headers: {
        ...apiHeaders(),
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      credentials: 'include',
      body: JSON.stringify({ agentId }),
    });
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!knowledgeBaseId || !files.length) return;
    setIsUploading(true);
    setUploadError('');
    try {
      const form = new FormData();
      form.append('knowledgeBaseId', knowledgeBaseId);
      Array.from(files).forEach((file) => {
        form.append('title', file.name.replace(/\.[^.]+$/, '') || file.name);
        form.append('file', file);
      });
      const response = await fetch(`${API_URL}/v1/knowledge/documents/bulk`, {
        method: 'POST',
        headers: apiHeaders(),
        body: form,
        credentials: 'include',
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const parsed = parseApiError(body);
        if (parsed.code === 'QUOTA_EXCEEDED' && parsed.details) {
          setUploadError(
            t('quota.exceeded', {
              metric: t(quotaErrorKey(parsed.details.metric)),
              current: String(parsed.details.current),
              limit: String(parsed.details.limit),
            }),
          );
        } else {
          setUploadError(parsed.message || t('onboarding.uploadFailed'));
        }
        return;
      }
      await assignToAgent(knowledgeBaseId);
      await loadDocuments(knowledgeBaseId);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length) void uploadFiles(event.dataTransfer.files);
  }

  function statusLabel(status: string): string {
    if (status === 'READY') return t('onboarding.docReady');
    if (status === 'FAILED') return t('onboarding.docFailed');
    return t('onboarding.docProcessing');
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-2">{t('onboarding.step5Desc')}</p>

      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
        className={`rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-accent bg-accent/5' : 'border-border hover:border-border-2'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,.md,.html,.csv,.json"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void uploadFiles(e.target.files);
          }}
        />
        <p className="text-sm font-medium text-ink">{t('onboarding.uploadPrompt')}</p>
        <p className="text-xs text-ink-3 mt-1">{t('onboarding.uploadHint')}</p>
        {isUploading && <p className="text-xs text-accent mt-3">{t('onboarding.uploading')}</p>}
      </div>

      {uploadError && (
        <p className="text-error text-sm" role="alert">
          {uploadError}
        </p>
      )}

      {documents.length > 0 && (
        <ul className="flex flex-col gap-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between text-sm rounded-lg px-3 py-2 bg-surface-2"
            >
              <span className="truncate text-ink">{doc.title}</span>
              <span className="text-xs text-ink-3 shrink-0 ml-2">{statusLabel(doc.status)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-border px-4 py-3 flex items-start gap-3 bg-surface-2/50">
        <GoogleDriveIcon />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-ink">{t('onboarding.driveTitle')}</p>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-3 text-ink-3">
              {t('app.comingSoon')}
            </span>
          </div>
          <p className="text-xs text-ink-3 mt-1">{t('onboarding.driveDesc')}</p>
        </div>
      </div>
    </div>
  );
}

function GoogleDriveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 mt-0.5">
      <path d="M8.4 2L1.6 14h6.8L15.2 2H8.4z" fill="#0066DA" />
      <path d="M1.6 14l3.4 6h13.6l3.4-6H1.6z" fill="#00AC47" />
      <path d="M15.2 2l-6.8 12h13.6L22.4 2H15.2z" fill="#EA4335" />
      <path d="M8.4 2l6.8 12H22.4L15.2 2H8.4z" fill="#FFBA00" />
    </svg>
  );
}
