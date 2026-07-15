import {
  type EmbeddingProvider,
  type LanguageModelProvider,
  type RealtimeSpeechProvider,
  type SpeechToTextProvider,
  type TextToSpeechProvider,
} from '@montenegrina/provider-core';

import {
  DeepgramSpeechToTextProvider,
  type DeepgramSpeechToTextConfig,
} from './deepgram/deepgram-stt.provider.js';
import {
  ElevenLabsTextToSpeechProvider,
  type ElevenLabsTextToSpeechConfig,
} from './elevenlabs/elevenlabs-tts.provider.js';
import { OpenAIEmbeddingProvider } from './openai/openai-embedding.provider.js';
import {
  OpenAIRealtimeSpeechProvider,
  type OpenAIRealtimeConfig,
} from './openai/openai-realtime.provider.js';
import {
  OpenAILanguageModelProvider,
  type OpenAILanguageModelConfig,
} from './openai/openai-responses.provider.js';

export type PipelineMode = 'controlled' | 'direct_realtime';

export interface ProviderSet {
  stt: SpeechToTextProvider;
  llm: LanguageModelProvider;
  tts: TextToSpeechProvider;
  embeddings: EmbeddingProvider;
  realtime: RealtimeSpeechProvider;
}

export interface ProviderConfig {
  deepgram: DeepgramSpeechToTextConfig;
  openai: {
    apiKey: string;
    baseUrl?: string;
    languageModel?: string;
    reasoningEffort?: OpenAILanguageModelConfig['reasoningEffort'];
    embeddingModel?: string;
    embeddingDimensions?: number;
  };
  elevenLabs: ElevenLabsTextToSpeechConfig;
  openaiRealtime: OpenAIRealtimeConfig;
}

export function createProviderRegistry(config: ProviderConfig): ProviderSet {
  return {
    stt: new DeepgramSpeechToTextProvider(config.deepgram),
    llm: new OpenAILanguageModelProvider({
      apiKey: config.openai.apiKey,
      ...(config.openai.languageModel ? { model: config.openai.languageModel } : {}),
      ...(config.openai.reasoningEffort ? { reasoningEffort: config.openai.reasoningEffort } : {}),
      ...(config.openai.baseUrl ? { baseUrl: config.openai.baseUrl } : {}),
    }),
    tts: new ElevenLabsTextToSpeechProvider(config.elevenLabs),
    embeddings: new OpenAIEmbeddingProvider({
      apiKey: config.openai.apiKey,
      ...(config.openai.embeddingModel ? { model: config.openai.embeddingModel } : {}),
      ...(config.openai.embeddingDimensions
        ? { dimensions: config.openai.embeddingDimensions }
        : {}),
      ...(config.openai.baseUrl ? { baseUrl: config.openai.baseUrl } : {}),
    }),
    realtime: new OpenAIRealtimeSpeechProvider(config.openaiRealtime),
  };
}

export function assertPipelineProviders(mode: PipelineMode, providers: ProviderSet): void {
  if (mode === 'controlled' && providers.realtime.id === 'openai-realtime') {
    // Having the comparison adapter registered is allowed; orchestration must not invoke it.
    return;
  }
  if (mode === 'direct_realtime' && providers.realtime.id === '') {
    throw new Error('Direct realtime mode requires a realtime speech provider');
  }
}
