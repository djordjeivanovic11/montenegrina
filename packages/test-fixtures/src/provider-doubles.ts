/* Provider test doubles intentionally resolve async contracts without external I/O. */
/* eslint-disable @typescript-eslint/require-await */
import { createHash } from 'node:crypto';

import type {
  AudioChunk,
  AudioFrame,
  EmbeddingProvider,
  EmbeddingRequest,
  LanguageModelProvider,
  LanguageModelRequest,
  LanguageModelResult,
  LanguageModelStreamEvent,
  ProviderMetadata,
  ProviderRequestContext,
  ProviderResult,
  RealtimeProviderEvent,
  RealtimeSpeechProvider,
  RealtimeSpeechSession,
  SpeechToTextProvider,
  SpeechToTextRequest,
  TextToSpeechProvider,
  TextToSpeechRequest,
  TranscriptionResult,
} from '@montenegrina/provider-core';

const meta = (provider: string, usage: ProviderMetadata['usage'] = {}): ProviderMetadata => ({
  provider,
  model: `${provider}-test-double`,
  latencyMs: 0,
  usage,
  attributes: { deterministic: true },
});

export class FakeSpeechToTextProvider implements SpeechToTextProvider {
  readonly id = 'fake-stt';
  async transcribe(
    request: SpeechToTextRequest,
    _context: ProviderRequestContext,
  ): Promise<ProviderResult<TranscriptionResult>> {
    void _context;
    const text = 'Dobar dan, želim informacije o vašim uslugama.';
    return {
      data: { text, providerLanguage: request.providerLanguage, confidence: 1, words: [] },
      metadata: meta(this.id),
    };
  }
  async health(): Promise<{ healthy: boolean }> {
    return { healthy: true };
  }
}

export class FakeLanguageModelProvider implements LanguageModelProvider {
  readonly id = 'fake-llm';
  async generate(
    request: LanguageModelRequest,
    _context: ProviderRequestContext,
  ): Promise<ProviderResult<LanguageModelResult>> {
    void _context;
    const input = request.messages.at(-1)?.content.toLocaleLowerCase('cnr') ?? '';
    const text = input.includes('radno vrijeme')
      ? 'Radno vrijeme je od ponedjeljka do petka, od 8 do 16 časova.'
      : 'Razumijem. Kako mogu dodatno da vam pomognem?';
    return { data: { text, toolCalls: [] }, metadata: meta(this.id) };
  }
  async *stream(
    request: LanguageModelRequest,
    context: ProviderRequestContext,
  ): AsyncIterable<LanguageModelStreamEvent> {
    const result = await this.generate(request, context);
    yield { type: 'text.delta', delta: result.data.text };
    yield { type: 'completed', ...result.data, metadata: result.metadata };
  }
  async health(): Promise<{ healthy: boolean }> {
    return { healthy: true };
  }
}

function wav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const result = new Uint8Array(44 + pcm.length);
  const view = new DataView(result.buffer);
  result.set(new TextEncoder().encode('RIFF'), 0);
  view.setUint32(4, pcm.length + 36, true);
  result.set(new TextEncoder().encode('WAVEfmt '), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  result.set(new TextEncoder().encode('data'), 36);
  view.setUint32(40, pcm.length, true);
  result.set(pcm, 44);
  return result;
}

export class FakeTextToSpeechProvider implements TextToSpeechProvider {
  readonly id = 'fake-tts';
  async synthesize(
    request: TextToSpeechRequest,
    _context: ProviderRequestContext,
  ): Promise<ProviderResult<Uint8Array>> {
    void _context;
    const pcm = new Uint8Array(request.outputFormat.sampleRate / 2);
    const data =
      request.outputFormat.encoding === 'wav' ? wav(pcm, request.outputFormat.sampleRate) : pcm;
    return { data, metadata: meta(this.id, { characters: request.text.length }) };
  }
  async *stream(
    request: TextToSpeechRequest,
    context: ProviderRequestContext,
  ): AsyncIterable<AudioChunk> {
    if (request.outputFormat.encoding === 'wav') throw new Error('WAV cannot be streamed');
    const result = await this.synthesize(request, context);
    yield { bytes: result.data, sequence: 1, format: request.outputFormat, final: true };
  }
  async health(): Promise<{ healthy: boolean }> {
    return { healthy: true };
  }
}

export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'fake-embedding';
  constructor(private readonly dimensions = 1_536) {}
  async embed(
    request: EmbeddingRequest,
    _context: ProviderRequestContext,
  ): Promise<ProviderResult<number[][]>> {
    void _context;
    const data = request.texts.map((text) => {
      const digest = createHash('sha256').update(text.normalize('NFC')).digest();
      return Array.from(
        { length: this.dimensions },
        (_, index) => ((digest[index % digest.length] ?? 0) - 127.5) / 127.5,
      );
    });
    return { data, metadata: meta(this.id) };
  }
  async health(): Promise<{ healthy: boolean }> {
    return { healthy: true };
  }
}

class FakeRealtimeSession implements RealtimeSpeechSession {
  private readonly queue: RealtimeProviderEvent[] = [];
  private closed = false;
  async sendAudio(frame: AudioFrame): Promise<void> {
    if (frame.bytes.length) this.queue.push({ type: 'transcription.final', text: 'Dobar dan.' });
  }
  async *events(): AsyncIterable<RealtimeProviderEvent> {
    while (!this.closed || this.queue.length) {
      const event = this.queue.shift();
      if (event) yield event;
      else await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }
  async interrupt(): Promise<void> {
    this.queue.splice(0, this.queue.length, { type: 'interrupted' });
  }
  async close(): Promise<void> {
    this.closed = true;
  }
}

export class FakeRealtimeSpeechProvider implements RealtimeSpeechProvider {
  readonly id = 'fake-realtime';
  async connect(): Promise<RealtimeSpeechSession> {
    return new FakeRealtimeSession();
  }
  async health(): Promise<{ healthy: boolean }> {
    return { healthy: true };
  }
}
