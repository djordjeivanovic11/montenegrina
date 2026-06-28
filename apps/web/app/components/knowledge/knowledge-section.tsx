'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type KnowledgeBase = {
  id: string;
  name: string;
  slug: string;
  description: string;
  defaultLanguage: string;
  enabled: boolean;
};

export type KnowledgeDocument = {
  id: string;
  knowledgeBaseId: string;
  title: string;
  status: string;
  version: number;
  documentType: string;
  language: string;
  errorCode?: string | null;
  createdAt: string;
  ingestionJobId?: string;
};

export type RetrievalResult = {
  chunkId: string;
  title: string;
  page?: number | null;
  section?: string | null;
  content: string;
  vectorScore: number;
  lexicalScore: number;
  rrfScore: number;
  rerankScore?: number;
  finalScore: number;
};

interface KnowledgeSectionProps {
  apiUrl: string;
  headers: () => Record<string, string>;
  agentId: string;
}

function statusLabel(status: string): string {
  if (status === 'READY') return 'Spreman';
  if (status === 'FAILED') return 'Neuspješno';
  if (status === 'PROCESSING' || status === 'UPLOADED') return 'Obrađuje se';
  return status;
}

export function KnowledgeSection({ apiUrl, headers, agentId }: KnowledgeSectionProps) {
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState('');
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [documentDetail, setDocumentDetail] = useState<Record<string, unknown> | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [ingestionJob, setIngestionJob] = useState<Record<string, unknown> | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [view, setView] = useState<'library' | 'detail' | 'lab'>('library');
  const [labQuery, setLabQuery] = useState('');
  const [labResults, setLabResults] = useState<RetrievalResult[]>([]);
  const [labContext, setLabContext] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBases = useCallback(async () => {
    const response = await fetch(`${apiUrl}/v1/knowledge/bases`, { headers: headers(), credentials: 'include' });
    if (!response.ok) return;
    const data = (await response.json()) as { items: KnowledgeBase[] };
    setBases(data.items);
    if (!selectedBaseId && data.items[0]) setSelectedBaseId(data.items[0].id);
  }, [apiUrl, headers, selectedBaseId]);

  const loadDocuments = useCallback(async (knowledgeBaseId: string) => {
    const response = await fetch(`${apiUrl}/v1/knowledge/documents?knowledgeBaseId=${knowledgeBaseId}`, {
      headers: headers(),
      credentials: 'include',
    });
    if (!response.ok) return;
    const data = (await response.json()) as { items: KnowledgeDocument[] };
    setDocuments(data.items);
  }, [apiUrl, headers]);

  useEffect(() => {
    void loadBases();
  }, [loadBases]);

  useEffect(() => {
    if (selectedBaseId) void loadDocuments(selectedBaseId);
  }, [selectedBaseId, loadDocuments]);

  useEffect(() => {
    if (!selectedDocumentId) return;
    void fetch(`${apiUrl}/v1/knowledge/documents/${selectedDocumentId}`, {
      headers: headers(),
      credentials: 'include',
    })
      .then((response) => response.json())
      .then((data) => setDocumentDetail(data as Record<string, unknown>));
    void fetch(`${apiUrl}/v1/knowledge/documents/${selectedDocumentId}/preview`, {
      headers: headers(),
      credentials: 'include',
    })
      .then((response) => response.json())
      .then((data) => setPreview(data as Record<string, unknown>));
  }, [apiUrl, headers, selectedDocumentId]);

  useEffect(() => {
    const pending = documents.filter((doc) => !['READY', 'FAILED'].includes(doc.status));
    if (!pending.length) return;
    const timer = setInterval(() => {
      if (selectedBaseId) void loadDocuments(selectedBaseId);
    }, 3000);
    return () => clearInterval(timer);
  }, [documents, selectedBaseId, loadDocuments]);

  async function handleBulkUpload(files: FileList | null) {
    if (!files?.length || !selectedBaseId) return;
    setIsUploading(true);
    setUploadError('');
    try {
      const form = new FormData();
      form.append('knowledgeBaseId', selectedBaseId);
      Array.from(files).forEach((file) => {
        form.append('title', file.name.replace(/\.[^.]+$/, ''));
        form.append('file', file);
      });
      const response = await fetch(`${apiUrl}/v1/knowledge/documents/bulk`, {
        method: 'POST',
        headers: headers(),
        body: form,
        credentials: 'include',
      });
      if (!response.ok) {
        setUploadError('Učitavanje nije uspjelo.');
        return;
      }
      await loadDocuments(selectedBaseId);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function pollIngestionJob(jobId: string) {
    const response = await fetch(`${apiUrl}/v1/knowledge/ingestion-jobs/${jobId}`, {
      headers: headers(),
      credentials: 'include',
    });
    if (response.ok) setIngestionJob((await response.json()) as Record<string, unknown>);
  }

  async function reindexDocument(documentId: string) {
    const response = await fetch(`${apiUrl}/v1/knowledge/documents/${documentId}/reindex`, {
      method: 'POST',
      headers: headers(),
      credentials: 'include',
    });
    if (response.ok) {
      const job = (await response.json()) as { id: string };
      void pollIngestionJob(job.id);
      if (selectedBaseId) void loadDocuments(selectedBaseId);
    }
  }

  async function deleteDocument(documentId: string) {
    await fetch(`${apiUrl}/v1/knowledge/documents/${documentId}`, {
      method: 'DELETE',
      headers: headers(),
      credentials: 'include',
    });
    setSelectedDocumentId(null);
    setView('library');
    if (selectedBaseId) void loadDocuments(selectedBaseId);
  }

  async function runRetrievalTest() {
    if (!agentId || !labQuery.trim()) return;
    const response = await fetch(`${apiUrl}/v1/knowledge/retrieve/test`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, query: labQuery, topK: 8 }),
      credentials: 'include',
    });
    if (!response.ok) return;
    const data = (await response.json()) as { results: RetrievalResult[]; context: string };
    setLabResults(data.results);
    setLabContext(data.context);
  }

  const selectedBase = useMemo(
    () => bases.find((base) => base.id === selectedBaseId),
    [bases, selectedBaseId],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div
        className="flex items-center gap-2 px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg text-sm cursor-pointer"
          style={{
            backgroundColor: view === 'library' ? 'var(--color-accent)' : 'var(--color-surface-2)',
            color: view === 'library' ? 'var(--color-accent-fg)' : 'var(--color-ink-2)',
          }}
          onClick={() => setView('library')}
        >
          Biblioteka
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg text-sm cursor-pointer"
          style={{
            backgroundColor: view === 'lab' ? 'var(--color-accent)' : 'var(--color-surface-2)',
            color: view === 'lab' ? 'var(--color-accent-fg)' : 'var(--color-ink-2)',
          }}
          onClick={() => setView('lab')}
        >
          Test pretrage
        </button>
        {view === 'library' && (
          <select
            value={selectedBaseId}
            onChange={(event) => setSelectedBaseId(event.target.value)}
            className="ml-auto px-3 py-1.5 rounded-lg text-sm"
            style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
          >
            {bases.map((base) => (
              <option key={base.id} value={base.id}>
                {base.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {view === 'lab' && (
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div>
            <label className="block text-sm mb-2 text-ink-2">Pitanje</label>
            <textarea
              value={labQuery}
              onChange={(event) => setLabQuery(event.target.value)}
              className="w-full min-h-24 rounded-lg p-3 text-sm"
              style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
            />
            <button
              type="button"
              className="mt-3 px-4 py-2 rounded-lg text-sm cursor-pointer"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
              onClick={() => void runRetrievalTest()}
            >
              Pokreni pretragu
            </button>
          </div>
          {labResults.length > 0 && (
            <div className="space-y-3">
              {labResults.map((result) => (
                <div
                  key={result.chunkId}
                  className="rounded-lg p-4 text-sm"
                  style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                >
                  <div className="font-medium">{result.title}</div>
                  <div className="text-xs text-ink-3 mt-1">
                    vector {result.vectorScore.toFixed(4)} · lexical {result.lexicalScore.toFixed(4)} · rrf{' '}
                    {result.rrfScore.toFixed(4)} · rerank {(result.rerankScore ?? 0).toFixed(4)} · final{' '}
                    {result.finalScore.toFixed(4)}
                  </div>
                  <p className="mt-2 text-ink-2 whitespace-pre-wrap">{result.content}</p>
                </div>
              ))}
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-3 mb-2">Kontekst za model</p>
                <pre
                  className="rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap"
                  style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                >
                  {labContext}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'library' && (
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 overflow-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">{selectedBase?.name ?? 'Baza znanja'}</h2>
                <p className="text-sm text-ink-3">{selectedBase?.description}</p>
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.html"
                  className="hidden"
                  onChange={(event) => void handleBulkUpload(event.target.files)}
                />
                <button
                  type="button"
                  disabled={isUploading || !selectedBaseId}
                  className="px-4 py-2 rounded-lg text-sm cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading ? 'Učitavanje…' : 'Dodaj dokumente'}
                </button>
              </div>
            </div>
            {uploadError && <p className="text-sm mb-3" style={{ color: 'var(--color-error)' }}>{uploadError}</p>}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3">
                  <th className="py-2">Naslov</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Tip</th>
                  <th className="py-2">Verzija</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr
                    key={document.id}
                    className="cursor-pointer hover:bg-[var(--color-surface-2)]"
                    onClick={() => {
                      setSelectedDocumentId(document.id);
                      setView('detail');
                    }}
                  >
                    <td className="py-2">{document.title}</td>
                    <td className="py-2">{statusLabel(document.status)}</td>
                    <td className="py-2">{document.documentType}</td>
                    <td className="py-2">{document.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'detail' && selectedDocumentId && documentDetail && (
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <button type="button" className="text-sm text-ink-2 cursor-pointer" onClick={() => setView('library')}>
            ← Nazad na biblioteku
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{String(documentDetail.title)}</h2>
              <p className="text-sm text-ink-3">{statusLabel(String(documentDetail.status))}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-sm cursor-pointer"
                style={{ border: '1px solid var(--color-border)' }}
                onClick={() => void reindexDocument(selectedDocumentId)}
              >
                Ponovo indeksiraj
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-sm cursor-pointer"
                style={{ color: 'var(--color-error)', border: '1px solid var(--color-border)' }}
                onClick={() => void deleteDocument(selectedDocumentId)}
              >
                Obriši
              </button>
            </div>
          </div>
          {ingestionJob && (
            <div className="rounded-lg p-4 text-sm" style={{ backgroundColor: 'var(--color-surface-2)' }}>
              <div>Faza: {String(ingestionJob.stage)}</div>
              <div>Napredak: {String(ingestionJob.progressPercent)}%</div>
              {typeof ingestionJob.errorDetails === 'string' && ingestionJob.errorDetails ? (
                <div style={{ color: 'var(--color-error)' }}>{ingestionJob.errorDetails}</div>
              ) : null}
            </div>
          )}
          {preview && (
            <div>
              <h3 className="font-medium mb-2">Pregled</h3>
              <pre
                className="rounded-lg p-4 text-xs whitespace-pre-wrap overflow-auto max-h-96"
                style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
              >
                {typeof preview.extractedText === 'string' ? preview.extractedText : ''}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
