import type {
  EmbeddingProvider,
  EmbeddingRequest,
  ProviderRequestContext,
  ProviderResult,
} from '@montenegrina/provider-core';

import { checkedProviderFetch } from '../provider-errors.js';

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  model?: string;
  dimensions?: number;
  baseUrl?: string;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'openai-embedding';
  readonly #model: string;
  readonly #dimensions: number;
  readonly #baseUrl: string;

  constructor(private readonly config: OpenAIEmbeddingConfig) {
    this.#model = config.model ?? 'text-embedding-3-large';
    this.#dimensions = config.dimensions ?? 1_536;
    this.#baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  }

  async embed(
    request: EmbeddingRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<number[][]>> {
    const startedAt = Date.now();
    const model = request.model ?? this.#model;
    const response = await checkedProviderFetch(
      this.id,
      `${this.#baseUrl}/embeddings`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: request.texts,
          encoding_format: 'float',
          dimensions: this.#dimensions,
        }),
      },
      context,
    );
    const body = (await response.json()) as {
      data: Array<{ index: number; embedding: number[] }>;
      usage?: { prompt_tokens?: number; total_tokens?: number };
    };
    const providerRequestId = response.headers.get('x-request-id');
    return {
      data: body.data.sort((left, right) => left.index - right.index).map((item) => item.embedding),
      metadata: {
        provider: this.id,
        model,
        latencyMs: Date.now() - startedAt,
        usage: {
          inputTokens: body.usage?.prompt_tokens ?? body.usage?.total_tokens ?? 0,
        },
        attributes: { dimensions: this.#dimensions },
        ...(providerRequestId ? { requestId: providerRequestId } : {}),
      },
    };
  }

  health(): Promise<{ healthy: boolean; reason?: string }> {
    return Promise.resolve(
      this.config.apiKey ? { healthy: true } : { healthy: false, reason: 'missing credential' },
    );
  }
}
