import { describe, expect, it } from 'vitest';

import { FakeEmbeddingProvider, FakeSpeechToTextProvider } from '../src/index.js';

describe('provider test doubles', () => {
  it('are deterministic and confined to the dev-only package', async () => {
    const context = {
      requestId: 'test', traceId: '0'.repeat(32), organizationId: 'test', timeoutMs: 100,
      dataPolicy: { allowedProviders: [], allowedRegions: [], allowFallback: false },
    };
    const transcript = await new FakeSpeechToTextProvider().transcribe({
      audio: new Uint8Array([1]),
      audioFormat: { encoding: 'wav', sampleRate: 24_000, channels: 1 },
      providerLanguage: 'sr',
    }, context);
    const first = await new FakeEmbeddingProvider(8).embed({ texts: [transcript.data.text] }, context);
    const second = await new FakeEmbeddingProvider(8).embed({ texts: [transcript.data.text] }, context);
    expect(first.data).toEqual(second.data);
  });
});
