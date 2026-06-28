import type {
  EmbeddingProvider,
  LanguageModelProvider,
  RealtimeSpeechProvider,
  SpeechToTextProvider,
  TextToSpeechProvider,
} from './types.js';

export class ProviderRegistry {
  readonly #stt = new Map<string, SpeechToTextProvider>();
  readonly #llm = new Map<string, LanguageModelProvider>();
  readonly #tts = new Map<string, TextToSpeechProvider>();
  readonly #realtime = new Map<string, RealtimeSpeechProvider>();
  readonly #embedding = new Map<string, EmbeddingProvider>();

  registerStt(provider: SpeechToTextProvider): this {
    this.#stt.set(provider.id, provider);
    return this;
  }
  registerLlm(provider: LanguageModelProvider): this {
    this.#llm.set(provider.id, provider);
    return this;
  }
  registerTts(provider: TextToSpeechProvider): this {
    this.#tts.set(provider.id, provider);
    return this;
  }
  registerRealtime(provider: RealtimeSpeechProvider): this {
    this.#realtime.set(provider.id, provider);
    return this;
  }
  registerEmbedding(provider: EmbeddingProvider): this {
    this.#embedding.set(provider.id, provider);
    return this;
  }

  stt(id: string): SpeechToTextProvider {
    return this.required(this.#stt, id, 'STT');
  }
  llm(id: string): LanguageModelProvider {
    return this.required(this.#llm, id, 'LLM');
  }
  tts(id: string): TextToSpeechProvider {
    return this.required(this.#tts, id, 'TTS');
  }
  realtime(id: string): RealtimeSpeechProvider {
    return this.required(this.#realtime, id, 'realtime');
  }
  embedding(id: string): EmbeddingProvider {
    return this.required(this.#embedding, id, 'embedding');
  }

  private required<T>(registry: ReadonlyMap<string, T>, id: string, kind: string): T {
    const provider = registry.get(id);
    if (!provider) throw new Error(`Unknown ${kind} provider: ${id}`);
    return provider;
  }
}

