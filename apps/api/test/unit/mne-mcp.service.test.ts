import type { Environment } from '@montenegrina/config';
import type { Redis } from 'ioredis';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MneMcpService } from '../../src/integrations/mne-mcp.service.js';

function environment(overrides: Partial<Environment> = {}): Environment {
  return {
    MNE_MCP_ENABLED: true,
    MNE_MCP_API_URL: 'https://api.mne-mcp.test',
    MNE_MCP_API_KEY: 'secret',
    MNE_MCP_TIMEOUT_MS: 1_200,
    MNE_MCP_CACHE_TTL_SECONDS: 60,
    ...overrides,
  } as Environment;
}

function redis(cached: string | null = null): Redis {
  return {
    get: vi.fn().mockResolvedValue(cached),
    set: vi.fn().mockResolvedValue('OK'),
  } as unknown as Redis;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MneMcpService', () => {
  it('does not call the network unless the turn requests MNE-MCP', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new MneMcpService(environment(), redis());

    const result = await service.retrieve('pitanje', { requested: false });

    expect(result.status).toBe('disabled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps and caches a bounded successful response', async () => {
    const cache = redis();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            route: 'national',
            mode: 'semantic',
            items: [
              {
                kind: 'document',
                id: 'segment-1',
                segment_id: 'segment-1',
                document_id: 'document-1',
                source: 'regis',
                title: 'Zakon o privrednim društvima',
                content: 'Društvo može osnovati jedno ili više lica.',
                score: 0.8,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const service = new MneMcpService(environment(), cache);

    const result = await service.retrieve('Ko može osnovati društvo?', {
      requested: true,
      limit: 4,
    });

    expect(result.status).toBe('success');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toContain('[MNE-MCP]');
    expect(result.items[0]?.content).toContain('jedno ili više lica');
    expect(cache.set).toHaveBeenCalledOnce();
  });

  it('returns a fast failure result instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')));
    const service = new MneMcpService(environment(), redis());

    const result = await service.retrieve('pitanje', { requested: true });

    expect(result.status).toBe('failed');
    expect(result.items).toEqual([]);
  });

  it('serves successful cached results without a network call', async () => {
    const cached = JSON.stringify({
      items: [],
      status: 'success',
      latencyMs: 123,
      cacheHit: false,
      route: 'national',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new MneMcpService(environment(), redis(cached));

    const result = await service.retrieve('pitanje', { requested: true });

    expect(result.status).toBe('success');
    expect(result.cacheHit).toBe(true);
    expect(result.latencyMs).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
