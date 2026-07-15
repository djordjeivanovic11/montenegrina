import { describe, expect, it } from 'vitest';
import {
  executeWithFallback,
  MemoryCircuitBreaker,
  ProviderError,
  type ProviderRequestContext,
} from '../src/index.js';

const context: ProviderRequestContext = {
  requestId: 'request-1',
  traceId: '0123456789abcdef0123456789abcdef',
  organizationId: 'org-1',
  timeoutMs: 1_000,
  dataPolicy: {
    allowedProviders: ['primary', 'secondary'],
    allowedRegions: ['eu'],
    allowFallback: true,
  },
};

describe('routing', () => {
  it('falls back only after retryable failure', async () => {
    const result = await executeWithFallback({
      candidates: [
        { id: 'primary', provider: 'primary', region: 'eu', priority: 1, dataCategories: [] },
        { id: 'secondary', provider: 'secondary', region: 'eu', priority: 2, dataCategories: [] },
      ],
      context,
      circuitBreaker: new MemoryCircuitBreaker(),
      operation(provider) {
        if (provider === 'primary') {
          throw new ProviderError({
            code: 'PRIMARY_TIMEOUT',
            message: 'timeout',
            provider,
            failureClass: 'RETRYABLE',
          });
        }
        return Promise.resolve({
          data: 'ok',
          metadata: { provider, model: 'test', latencyMs: 1, usage: {}, attributes: {} },
        });
      },
    });
    expect(result.data).toBe('ok');
    expect(result.metadata.fallbackHistory).toEqual([
      { provider: 'primary', code: 'PRIMARY_TIMEOUT', retryable: true },
    ]);
  });

  it('blocks a fallback excluded by tenant policy', async () => {
    await expect(
      executeWithFallback({
        candidates: [
          { id: 'forbidden', provider: 'forbidden', region: 'us', priority: 1, dataCategories: [] },
        ],
        context,
        circuitBreaker: new MemoryCircuitBreaker(),
        operation() {
          return Promise.reject(new Error('must not execute'));
        },
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_POLICY_NO_ELIGIBLE_CANDIDATE' });
  });
});
