import { loadEnvironment } from '@montenegrina/config';

const environment = loadEnvironment();

export interface ParsedDocument {
  parserVersion: string;
  pageCount?: number | null;
  extractedText: string;
  sections: Array<{
    heading?: string | null;
    level?: number;
    pageStart?: number | null;
    pageEnd?: number | null;
    articleNumber?: string | null;
    content: string;
    parentIndex?: number | null;
    isTable?: boolean;
    metadata?: Record<string, unknown>;
  }>;
}

export class KnowledgeParserClient {
  constructor(private readonly baseUrl = environment.KNOWLEDGE_PARSER_URL) {}

  async parse(bytes: Uint8Array, mediaType: string): Promise<ParsedDocument> {
    const form = new FormData();
    form.append('mediaType', mediaType);
    form.append('file', new Blob([Buffer.from(bytes)], { type: mediaType }), 'document');
    const response = await fetch(`${this.baseUrl}/v1/parse-bytes`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(environment.KNOWLEDGE_PARSER_TIMEOUT_SECONDS * 1_000),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`PARSER_FAILED:${detail.slice(0, 200)}`);
    }
    return (await response.json()) as ParsedDocument;
  }

  async rerank(query: string, passages: string[]): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/v1/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, passages }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error('RERANK_FAILED');
    }
    const payload = (await response.json()) as { scores: number[] };
    return payload.scores;
  }
}
