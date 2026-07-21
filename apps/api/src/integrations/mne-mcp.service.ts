import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import type { RetrievalCandidate } from '@montenegrina/knowledge-core';
import type { Redis } from 'ioredis';
import { v5 as uuidv5 } from 'uuid';

import { ENVIRONMENT, REDIS } from '../core/tokens.js';

const CACHE_VERSION = 'v1';
const UUID_NAMESPACE = uuidv5('https://mne-mcp.com/integrations/montenegrina', uuidv5.URL);

type MneMcpStatus = 'disabled' | 'unavailable' | 'success' | 'failed';

interface MneMcpItem {
  kind: 'document' | 'registry';
  id: string;
  segment_id?: string | null;
  document_id?: string | null;
  source: string;
  title: string;
  content: string;
  source_url?: string | null;
  document_type?: string | null;
  score?: number | null;
}

interface MneMcpPayload {
  items?: MneMcpItem[];
  route?: string;
  mode?: string;
  timings_ms?: { total?: number };
}

export interface MneMcpRetrievalResult {
  items: RetrievalCandidate[];
  status: MneMcpStatus;
  latencyMs: number;
  cacheHit: boolean;
  route?: string;
  mode?: string;
}

@Injectable()
export class MneMcpService {
  readonly #logger = new Logger(MneMcpService.name);

  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  available(): boolean {
    return Boolean(
      this.environment.MNE_MCP_ENABLED &&
      this.environment.MNE_MCP_API_URL &&
      this.environment.MNE_MCP_API_KEY,
    );
  }

  async retrieve(
    query: string,
    options: { requested: boolean; limit?: number },
  ): Promise<MneMcpRetrievalResult> {
    if (!options.requested) return this.empty('disabled');
    if (!this.available()) return this.empty('unavailable');

    const limit = Math.max(1, Math.min(4, options.limit ?? 4));
    const cacheKey = `mne-mcp:retrieve:${CACHE_VERSION}:${createHash('sha256')
      .update(`${query.trim().toLowerCase()}:${limit}`)
      .digest('hex')}`;
    if (this.environment.MNE_MCP_CACHE_TTL_SECONDS > 0) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as MneMcpRetrievalResult;
          return { ...parsed, cacheHit: true, latencyMs: 0 };
        }
      } catch {
        // Cache is an optimization. A malformed value or Redis outage must not block retrieval.
      }
    }

    const started = Date.now();
    try {
      const response = await fetch(
        `${this.environment.MNE_MCP_API_URL.replace(/\/$/u, '')}/integrations/montenegrina/retrieve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.environment.MNE_MCP_API_KEY as string,
          },
          body: JSON.stringify({ query, limit }),
          redirect: 'error',
          signal: AbortSignal.timeout(this.environment.MNE_MCP_TIMEOUT_MS),
        },
      );
      if (!response.ok) throw new Error(`MNE_MCP_HTTP_${response.status}`);
      const payload = (await response.json()) as MneMcpPayload;
      if (!Array.isArray(payload.items)) throw new Error('MNE_MCP_PAYLOAD_INVALID');
      const result: MneMcpRetrievalResult = {
        items: payload.items.slice(0, limit).map((item) => this.mapItem(item)),
        status: 'success',
        latencyMs: Date.now() - started,
        cacheHit: false,
        ...(payload.route ? { route: payload.route } : {}),
        ...(payload.mode ? { mode: payload.mode } : {}),
      };
      if (this.environment.MNE_MCP_CACHE_TTL_SECONDS > 0) {
        try {
          await this.redis.set(
            cacheKey,
            JSON.stringify(result),
            'EX',
            this.environment.MNE_MCP_CACHE_TTL_SECONDS,
          );
        } catch {
          // Return the successful retrieval even when the best-effort cache is unavailable.
        }
      }
      return result;
    } catch (error) {
      const latencyMs = Date.now() - started;
      this.#logger.warn({
        message: 'MNE-MCP retrieval failed',
        latencyMs,
        code: error instanceof Error ? error.name : 'UNKNOWN',
      });
      return { ...this.empty('failed'), latencyMs };
    }
  }

  private mapItem(item: MneMcpItem): RetrievalCandidate {
    const stableKey = `${item.kind}:${item.source}:${item.id}`;
    const documentId = uuidv5(`document:${item.document_id ?? stableKey}`, UUID_NAMESPACE);
    const chunkId = uuidv5(`chunk:${item.segment_id ?? stableKey}`, UUID_NAMESPACE);
    const score = Number(item.score ?? 0);
    return {
      chunkId,
      documentId,
      documentVersionId: uuidv5(`version:${item.document_id ?? stableKey}`, UUID_NAMESPACE),
      title: `[MNE-MCP] ${item.title}`,
      documentType: item.document_type ?? item.kind,
      language: 'cnr',
      version: 1,
      section: item.source,
      sourceUrl: item.source_url ?? null,
      content: item.content,
      vectorScore: score,
      lexicalScore: 0,
      rrfScore: score,
      finalScore: score,
    };
  }

  private empty(status: MneMcpStatus): MneMcpRetrievalResult {
    return { items: [], status, latencyMs: 0, cacheHit: false };
  }
}
