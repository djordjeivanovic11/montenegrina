'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { parseApiError } from '../../lib/api-client';

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

type PreviewSection = {
  id: string;
  heading?: string | null;
  level?: number;
  pageStart?: number | null;
  content: string;
};

type DocumentPreview = {
  documentId: string;
  version: number;
  mediaType?: string;
  extractedText?: string | null;
  sections?: PreviewSection[];
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

function thumbBarClass(status: string): string {
  if (status === 'READY') return 'knowledge-doc-thumb-bar-ready';
  if (status === 'FAILED') return 'knowledge-doc-thumb-bar-failed';
  return 'knowledge-doc-thumb-bar-pending';
}

function DocumentThumbnail({ title, status }: { title: string; status: string }) {
  const snippet = title.replace(/\.[^.]+$/, '').slice(0, 48);
  return (
    <div className="knowledge-doc-thumb" aria-hidden>
      <div className={`knowledge-doc-thumb-bar ${thumbBarClass(status)}`} />
      <div className="knowledge-doc-thumb-body">{snippet}</div>
    </div>
  );
}

function DocumentPreviewPanel({
  document,
  preview,
  previewLoading,
  contentUrl,
  contentLoading,
  ingestionJob,
  onReindex,
  onDelete,
}: {
  document: KnowledgeDocument;
  preview: DocumentPreview | null;
  previewLoading: boolean;
  contentUrl: string | null;
  contentLoading: boolean;
  ingestionJob: Record<string, unknown> | null;
  onReindex: () => void;
  onDelete: () => void;
}) {
  const sections = preview?.sections ?? [];
  const extractedText = preview?.extractedText ?? '';

  return (
    <div className="animate-fade-in w-full min-w-0">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink break-words">{document.title}</h2>
          <p className="text-sm text-ink-3 mt-1">
            {statusLabel(document.status)} · v{document.version} · {document.documentType}
          </p>
          {document.errorCode && (
            <p className="text-sm mt-2" style={{ color: 'var(--color-error)' }}>
              {document.errorCode}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" className="btn-secondary text-sm" onClick={onReindex}>
            Ponovo indeksiraj
          </button>
          <button type="button" className="btn-secondary text-sm text-red-600" onClick={onDelete}>
            Obriši
          </button>
        </div>
      </div>

      {ingestionJob && (
        <div className="rounded-lg p-4 text-sm mb-4 card">
          <div>Faza: {String(ingestionJob.stage)}</div>
          <div>Napredak: {String(ingestionJob.progressPercent)}%</div>
          {typeof ingestionJob.errorDetails === 'string' && ingestionJob.errorDetails ? (
            <div style={{ color: 'var(--color-error)' }}>{ingestionJob.errorDetails}</div>
          ) : null}
        </div>
      )}

      {previewLoading || contentLoading ? (
        <p className="text-sm text-ink-2">Učitavanje pregleda…</p>
      ) : document.status === 'READY' && contentUrl ? (
        <div className="knowledge-a4-page knowledge-a4-page-pdf">
          <iframe title={document.title} src={contentUrl} />
        </div>
      ) : sections.length > 0 ? (
        sections.map((section) => (
          <div key={section.id} className="knowledge-a4-page">
            {section.heading && <h3 className="knowledge-a4-heading">{section.heading}</h3>}
            <div className="knowledge-a4-text">{section.content}</div>
          </div>
        ))
      ) : extractedText ? (
        <div className="knowledge-a4-page">
          <div className="knowledge-a4-text">{extractedText}</div>
        </div>
      ) : (
        <div className="knowledge-a4-page items-center justify-center text-center">
          <p className="text-sm text-ink-3">
            {document.status === 'FAILED'
              ? 'Dokument nije obrađen. Pokušajte ponovo indeksirati ili obrišite i ponovo učitajte.'
              : 'Pregled će biti dostupan kada obrada završi.'}
          </p>
        </div>
      )}
    </div>
  );
}

export function KnowledgeSection({ apiUrl, headers, agentId }: KnowledgeSectionProps) {
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState('');
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [contentUrl, setContentUrl] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [ingestionJob, setIngestionJob] = useState<Record<string, unknown> | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [view, setView] = useState<'library' | 'lab'>('library');
  const [labQuery, setLabQuery] = useState('');
  const [labResults, setLabResults] = useState<RetrievalResult[]>([]);
  const [labContext, setLabContext] = useState('');
  const [labLoading, setLabLoading] = useState(false);
  const [labSearched, setLabSearched] = useState(false);
  const [labError, setLabError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBases = useCallback(async () => {
    const response = await fetch(`${apiUrl}/v1/knowledge/bases`, {
      headers: headers(),
      credentials: 'include',
    });
    if (!response.ok) return;
    const data = (await response.json()) as { items: KnowledgeBase[] };
    setBases(data.items);
    if (!selectedBaseId && data.items[0]) setSelectedBaseId(data.items[0].id);
  }, [apiUrl, headers, selectedBaseId]);

  const loadDocuments = useCallback(
    async (knowledgeBaseId: string) => {
      const response = await fetch(
        `${apiUrl}/v1/knowledge/documents?knowledgeBaseId=${knowledgeBaseId}`,
        {
          headers: headers(),
          credentials: 'include',
        },
      );
      if (!response.ok) return;
      const data = (await response.json()) as { items: KnowledgeDocument[] };
      setDocuments(data.items);
      setSelectedDocumentId((current) => {
        if (current && data.items.some((doc) => doc.id === current)) return current;
        return data.items[0]?.id ?? null;
      });
    },
    [apiUrl, headers],
  );

  const loadPreview = useCallback(
    async (documentId: string) => {
      setPreviewLoading(true);
      setPreview(null);
      try {
        const response = await fetch(`${apiUrl}/v1/knowledge/documents/${documentId}/preview`, {
          headers: headers(),
          credentials: 'include',
        });
        if (response.ok) {
          setPreview((await response.json()) as DocumentPreview);
        }
      } finally {
        setPreviewLoading(false);
      }
    },
    [apiUrl, headers],
  );

  useEffect(() => {
    void loadBases();
  }, [loadBases]);

  useEffect(() => {
    if (selectedBaseId) void loadDocuments(selectedBaseId);
  }, [selectedBaseId, loadDocuments]);

  const pollIngestionJob = useCallback(
    async (jobId: string) => {
      const response = await fetch(`${apiUrl}/v1/knowledge/ingestion-jobs/${jobId}`, {
        headers: headers(),
        credentials: 'include',
      });
      if (response.ok) setIngestionJob((await response.json()) as Record<string, unknown>);
    },
    [apiUrl, headers],
  );

  useEffect(() => {
    if (!selectedDocumentId || view !== 'library') return;
    void loadPreview(selectedDocumentId);
    void fetch(`${apiUrl}/v1/knowledge/documents/${selectedDocumentId}`, {
      headers: headers(),
      credentials: 'include',
    })
      .then((response) => response.json())
      .then((data) => {
        const doc = data as KnowledgeDocument;
        if (doc.ingestionJobId) void pollIngestionJob(doc.ingestionJobId);
      });
  }, [apiUrl, headers, selectedDocumentId, view, loadPreview, pollIngestionJob]);

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
        const body: unknown = await response.json().catch(() => null);
        const parsed = parseApiError(body);
        if (parsed.code === 'QUOTA_EXCEEDED' && parsed.details) {
          setUploadError(
            `Limit dokumenta (${parsed.details.current}/${parsed.details.limit}). Nadogradi plan ili obriši stare dokumente.`,
          );
        } else {
          setUploadError(parsed.message || 'Učitavanje nije uspjelo.');
        }
        return;
      }
      await loadDocuments(selectedBaseId);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

  async function deleteDocument(documentId: string, title: string) {
    if (!window.confirm(`Obrisati dokument "${title}"?`)) return;
    const response = await fetch(`${apiUrl}/v1/knowledge/documents/${documentId}`, {
      method: 'DELETE',
      headers: headers(),
      credentials: 'include',
    });
    if (!response.ok) return;
    setPreview(null);
    setIngestionJob(null);
    if (selectedDocumentId === documentId) setSelectedDocumentId(null);
    if (selectedBaseId) await loadDocuments(selectedBaseId);
  }

  async function runRetrievalTest() {
    if (!agentId || !labQuery.trim() || !selectedBaseId) return;
    setLabLoading(true);
    setLabSearched(false);
    setLabError('');
    setLabResults([]);
    setLabContext('');
    try {
      const response = await fetch(`${apiUrl}/v1/knowledge/retrieve/test`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          query: labQuery,
          topK: 5,
          knowledgeBaseId: selectedBaseId,
        }),
        credentials: 'include',
      });
      if (!response.ok) {
        setLabError('Pretraga nije uspjela. Provjerite da agent ima objavljenu verziju.');
        return;
      }
      const data = (await response.json()) as { results: RetrievalResult[]; context: string };
      setLabResults(data.results ?? []);
      setLabContext(data.context ?? '');
      setLabSearched(true);
    } finally {
      setLabLoading(false);
    }
  }

  const selectedBase = useMemo(
    () => bases.find((base) => base.id === selectedBaseId),
    [bases, selectedBaseId],
  );

  const selectedDocument = useMemo(
    () => documents.find((doc) => doc.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  );

  useEffect(() => {
    if (!selectedDocumentId || !selectedDocument || selectedDocument.status !== 'READY') {
      setContentUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setContentLoading(true);
    void fetch(`${apiUrl}/v1/knowledge/documents/${selectedDocumentId}/content`, {
      credentials: 'include',
      headers: headers(),
    })
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setContentUrl(objectUrl);
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setContentUrl(null);
    };
  }, [apiUrl, headers, selectedDocument, selectedDocumentId]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden card">
      <div className="flex items-center gap-2 px-4 py-3 shrink-0 border-b border-border">
        <button
          type="button"
          className={`px-3 py-1.5 rounded-lg text-sm ${view === 'library' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setView('library')}
        >
          Biblioteka
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 rounded-lg text-sm ${view === 'lab' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setView('lab')}
        >
          Test pretrage
        </button>
        {view === 'library' && (
          <select
            value={selectedBaseId}
            onChange={(event) => setSelectedBaseId(event.target.value)}
            className="ml-auto input-field text-sm py-1.5 w-auto"
            aria-label="Baza znanja"
          >
            {bases.map((base) => (
              <option key={base.id} value={base.id}>
                {base.name}
              </option>
            ))}
          </select>
        )}
        {view === 'lab' && (
          <select
            value={selectedBaseId}
            onChange={(event) => setSelectedBaseId(event.target.value)}
            className="ml-auto input-field text-sm py-1.5 w-auto max-w-xs"
            aria-label="Baza znanja za pretragu"
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
        <div className="knowledge-lab flex-1 min-h-0 overflow-auto p-6">
          <div className="knowledge-lab-form">
            <label className="field-label block mb-2">Pitanje</label>
            <textarea
              value={labQuery}
              onChange={(event) => setLabQuery(event.target.value)}
              className="input-field min-h-28 resize-y w-full"
              aria-label="Pitanje za pretragu"
            />
            <button
              type="button"
              className="btn-primary text-sm mt-3"
              disabled={labLoading || !agentId || !selectedBaseId || !labQuery.trim()}
              onClick={() => void runRetrievalTest()}
            >
              {labLoading ? 'Pretražujem…' : 'Pokreni pretragu'}
            </button>
            {labError && <p className="text-sm mt-3 text-red-600">{labError}</p>}
          </div>

          {labLoading && <p className="text-sm text-ink-2 mt-6">Pretražujem dokumente…</p>}

          {!labLoading && labSearched && labResults.length === 0 && (
            <p className="text-sm text-ink-2 mt-6">
              Nema rezultata za ovo pitanje u odabranoj bazi znanja.
            </p>
          )}

          {labResults.length > 0 && (
            <div className="knowledge-lab-results mt-6 space-y-3">
              {labResults.map((result) => (
                <div key={result.chunkId} className="card p-4 text-sm">
                  <div className="font-medium">{result.title}</div>
                  <div className="text-xs text-ink-3 mt-1">
                    {result.section ? `${result.section} · ` : ''}
                    final {result.finalScore.toFixed(4)}
                  </div>
                  <p className="mt-2 text-ink-2 whitespace-pre-wrap">{result.content}</p>
                </div>
              ))}
              {labContext && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-3 mb-2">
                    Kontekst za model
                  </p>
                  <pre className="card p-3 text-xs overflow-auto whitespace-pre-wrap">
                    {labContext}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {view === 'library' && (
        <div className="knowledge-split">
          <div className="knowledge-sidebar">
            <div className="p-3 border-b border-border space-y-2">
              <p className="text-xs font-semibold text-ink-2 uppercase tracking-wide">Dokumenti</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.html"
                className="hidden"
                aria-label="Odabir dokumenata"
                onChange={(event) => void handleBulkUpload(event.target.files)}
              />
              <button
                type="button"
                disabled={isUploading || !selectedBaseId}
                className="btn-primary text-xs w-full disabled:opacity-50"
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? 'Učitavanje…' : 'Dodaj dokumente'}
              </button>
              {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
            </div>
            {documents.length === 0 ? (
              <p className="p-4 text-sm text-ink-3">Nema dokumenata.</p>
            ) : (
              documents.map((document) => (
                <div
                  key={document.id}
                  className={`knowledge-doc-row ${selectedDocumentId === document.id ? 'knowledge-doc-row-selected' : ''}`}
                  onClick={() => setSelectedDocumentId(document.id)}
                >
                  <DocumentThumbnail title={document.title} status={document.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-ink leading-snug break-words">
                      {document.title}
                    </p>
                    <p className="text-[10px] text-ink-3 mt-1">{statusLabel(document.status)}</p>
                  </div>
                  <button
                    type="button"
                    className="text-ink-3 hover:text-red-600 text-sm px-1 shrink-0"
                    title="Obriši"
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteDocument(document.id, document.title);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="knowledge-preview-pane">
            {!selectedDocument ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <div className="knowledge-a4-page max-w-[12rem] opacity-40 mb-4" aria-hidden>
                  <p className="text-xs text-ink-3 text-center m-auto">A4</p>
                </div>
                <h3 className="text-sm font-medium text-ink">
                  {selectedBase?.name ?? 'Baza znanja'}
                </h3>
                <p className="text-sm text-ink-3 mt-1 max-w-sm">
                  {selectedBase?.description || 'Odaberite dokument s lijeve strane za pregled.'}
                </p>
              </div>
            ) : (
              <DocumentPreviewPanel
                document={selectedDocument}
                preview={preview}
                previewLoading={previewLoading}
                contentUrl={contentUrl}
                contentLoading={contentLoading}
                ingestionJob={ingestionJob}
                onReindex={() => void reindexDocument(selectedDocument.id)}
                onDelete={() => void deleteDocument(selectedDocument.id, selectedDocument.title)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
