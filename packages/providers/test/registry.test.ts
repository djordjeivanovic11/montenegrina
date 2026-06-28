import { describe, expect, it } from 'vitest';

import { createProviderRegistry } from '../src/index.js';

describe('provider registry', () => {
  it('constructs the production adapters with explicit configuration', () => {
    const registry = createProviderRegistry({
      deepgram: { apiKey: 'dg', model: 'nova-3', providerLanguage: 'sr' },
      openai: {
        apiKey: 'oa',
        languageModel: 'gpt-5.4-mini',
        reasoningEffort: 'none',
        embeddingModel: 'text-embedding-3-large',
        embeddingDimensions: 1536,
      },
      elevenLabs: {
        apiKey: 'el',
        model: 'eleven_flash_v2_5',
        voiceId: 'voice',
        outputFormat: { encoding: 'pcm_s16le', sampleRate: 24_000, channels: 1 },
      },
      openaiRealtime: { apiKey: 'oa', model: 'gpt-realtime-2' },
    });
    expect(registry.stt.id).toBe('deepgram');
    expect(registry.llm.id).toBe('openai');
    expect(registry.tts.id).toBe('elevenlabs');
    expect(registry.embeddings.id).toBe('openai-embedding');
    expect(registry.realtime.id).toBe('openai-realtime');
  });
});
