import { Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';

import { ENVIRONMENT } from '../core/tokens.js';

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

@Injectable()
export class KnowledgeParserClient {
  constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {}

  async rerank(query: string, passages: string[]): Promise<number[]> {
    if (!passages.length) return [];
    const response = await fetch(`${this.environment.KNOWLEDGE_PARSER_URL}/v1/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, passages }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error('RERANK_FAILED');
    const payload = (await response.json()) as { scores: number[] };
    return payload.scores;
  }
}
