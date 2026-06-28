import type { Environment } from '@montenegrina/config';
import { createProviderRegistry, type ProviderSet } from '@montenegrina/providers';

export function providersFromEnvironment(environment: Environment): ProviderSet {
  return createProviderRegistry({
    deepgram: {
      apiKey: environment.DEEPGRAM_API_KEY as string,
      model: environment.DEEPGRAM_MODEL,
      providerLanguage: 'sr',
    },
    openai: {
      apiKey: environment.OPENAI_API_KEY as string,
      languageModel: environment.OPENAI_MODEL,
      reasoningEffort: 'none',
      embeddingModel: environment.OPENAI_EMBEDDING_MODEL,
      embeddingDimensions: environment.OPENAI_EMBEDDING_DIMENSIONS,
    },
    elevenLabs: {
      apiKey: environment.ELEVENLABS_API_KEY as string,
      model: environment.ELEVENLABS_MODEL,
      voiceId: environment.ELEVENLABS_MONTENEGRIN_VOICE_ID as string,
      outputFormat: { encoding: 'pcm_s16le', sampleRate: 24_000, channels: 1 },
    },
    openaiRealtime: {
      apiKey: environment.OPENAI_API_KEY as string,
      model: environment.OPENAI_REALTIME_MODEL,
    },
  });
}
