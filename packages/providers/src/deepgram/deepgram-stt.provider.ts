import {
  ProviderError,
  type AudioFormat,
  type ProviderMetadata,
  type ProviderRequestContext,
  type ProviderResult,
  type SpeechToTextProvider,
  type SpeechToTextRequest,
  type SpeechToTextStreamEvent,
  type StreamingSpeechToTextRequest,
  type StreamingSpeechToTextSession,
  type TranscriptionResult,
} from '@montenegrina/provider-core';
import WebSocket from 'ws';

import { AsyncEventQueue } from '../async-event-queue.js';
import {
  checkedProviderFetch,
  normalizeProviderSocketError,
  providerAbortSignal,
  providerString,
} from '../provider-errors.js';

export interface DeepgramSpeechToTextConfig {
  apiKey: string;
  model?: string;
  providerLanguage?: 'sr' | 'hr' | 'bs' | 'multi';
  endpointingMs?: number;
}

function contentType(format: AudioFormat): string {
  switch (format.encoding) {
    case 'pcm_s16le':
      return `audio/l16;rate=${format.sampleRate};channels=${format.channels}`;
    case 'mulaw':
      return `audio/x-mulaw;rate=${format.sampleRate};channels=${format.channels}`;
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'opus':
      return 'audio/ogg;codecs=opus';
  }
}

function addRawAudioQuery(query: URLSearchParams, format: AudioFormat): void {
  if (format.encoding !== 'pcm_s16le' && format.encoding !== 'mulaw') return;
  query.set('encoding', format.encoding === 'pcm_s16le' ? 'linear16' : 'mulaw');
  query.set('sample_rate', String(format.sampleRate));
  query.set('channels', String(format.channels));
}

interface DeepgramAlternative {
  transcript?: string;
  confidence?: number;
  words?: Array<{ word: string; start: number; end: number; confidence?: number }>;
}

interface DeepgramResponse {
  metadata?: { request_id?: string; duration?: number };
  results?: { channels?: Array<{ alternatives?: DeepgramAlternative[] }> };
}

function parseAlternative(
  alternative: DeepgramAlternative,
  providerLanguage: string,
): TranscriptionResult {
  return {
    text: alternative.transcript ?? '',
    providerLanguage,
    ...(alternative.confidence === undefined ? {} : { confidence: alternative.confidence }),
    words: (alternative.words ?? []).map((word) => ({
      word: word.word,
      startMs: Math.round(word.start * 1_000),
      endMs: Math.round(word.end * 1_000),
      ...(word.confidence === undefined ? {} : { confidence: word.confidence }),
    })),
  };
}

function providerMetadata(options: {
  model: string;
  startedAt: number;
  requestId?: string;
  duration?: number;
  language: string;
}): ProviderMetadata {
  return {
    provider: 'deepgram',
    model: options.model,
    latencyMs: Date.now() - options.startedAt,
    usage: options.duration === undefined ? {} : { audioInputSeconds: options.duration },
    attributes: { providerLanguage: options.language },
    ...(options.requestId ? { requestId: options.requestId } : {}),
  };
}

class DeepgramStreamingSession implements StreamingSpeechToTextSession {
  readonly #events = new AsyncEventQueue<SpeechToTextStreamEvent>();
  #closed = false;

  constructor(
    private readonly socket: WebSocket,
    private readonly request: StreamingSpeechToTextRequest,
  ) {
    socket.on('message', (message) => this.handleMessage(providerString(message)));
    socket.on('error', (error) => {
      this.#events.push({
        type: 'error',
        error: normalizeProviderSocketError('deepgram', error),
        receivedAtMs: Date.now(),
      });
    });
    socket.on('close', () => {
      this.#closed = true;
      this.#events.close();
    });
  }

  async sendAudio(frame: Parameters<StreamingSpeechToTextSession['sendAudio']>[0]): Promise<void> {
    if (this.#closed || this.socket.readyState !== WebSocket.OPEN) {
      throw new ProviderError({
        code: 'DEEPGRAM_STREAM_CLOSED',
        message: 'Deepgram streaming session is closed.',
        provider: 'deepgram',
        failureClass: 'RETRYABLE',
      });
    }
    if (
      frame.format.encoding !== this.request.audioFormat.encoding ||
      frame.format.sampleRate !== this.request.audioFormat.sampleRate ||
      frame.format.channels !== this.request.audioFormat.channels
    ) {
      throw new ProviderError({
        code: 'DEEPGRAM_AUDIO_FORMAT_CHANGED',
        message: 'Audio format cannot change during a streaming session.',
        provider: 'deepgram',
        failureClass: 'NON_RETRYABLE',
      });
    }
    await new Promise<void>((resolve, reject) => {
      this.socket.send(frame.bytes, (error) => (error ? reject(error) : resolve()));
    });
  }

  events(): AsyncIterable<SpeechToTextStreamEvent> {
    return this.#events.iterate();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'CloseStream' }));
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.socket.terminate();
        resolve();
      }, 1_000);
      this.socket.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private handleMessage(raw: string): void {
    const receivedAtMs = Date.now();
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      this.#events.push({
        type: 'error',
        error: new ProviderError({
          code: 'DEEPGRAM_MALFORMED_MESSAGE',
          message: 'Deepgram returned malformed streaming data.',
          provider: 'deepgram',
          failureClass: 'NON_RETRYABLE',
          cause: error,
        }),
        receivedAtMs,
      });
      return;
    }
    if (message.type === 'SpeechStarted') {
      this.#events.push({ type: 'speech.started', receivedAtMs });
      return;
    }
    if (message.type === 'UtteranceEnd') {
      this.#events.push({ type: 'speech.ended', receivedAtMs });
      return;
    }
    if (message.type === 'Error') {
      this.#events.push({
        type: 'error',
        error: new ProviderError({
          code: providerString(message.code, 'DEEPGRAM_STREAM_ERROR'),
          message: 'Deepgram reported a streaming error.',
          provider: 'deepgram',
          failureClass: 'RETRYABLE',
        }),
        receivedAtMs,
      });
      return;
    }
    if (message.type !== 'Results') return;
    const channel = message.channel as { alternatives?: DeepgramAlternative[] } | undefined;
    const alternative = channel?.alternatives?.[0];
    if (!alternative) return;
    const result = parseAlternative(alternative, this.request.providerLanguage);
    if (message.is_final === true) {
      this.#events.push({ type: 'transcription.final', result, receivedAtMs });
      if (message.speech_final === true) this.#events.push({ type: 'speech.ended', receivedAtMs });
    } else {
      this.#events.push({ type: 'transcription.partial', text: result.text, receivedAtMs });
    }
  }
}

export class DeepgramSpeechToTextProvider implements SpeechToTextProvider {
  readonly id = 'deepgram';
  readonly #model: string;
  readonly #providerLanguage: 'sr' | 'hr' | 'bs' | 'multi';
  readonly #endpointingMs: number;

  constructor(private readonly config: DeepgramSpeechToTextConfig) {
    this.#model = config.model ?? 'nova-3';
    this.#providerLanguage = config.providerLanguage ?? 'sr';
    this.#endpointingMs = config.endpointingMs ?? 300;
  }

  async transcribe(
    request: SpeechToTextRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<TranscriptionResult>> {
    const startedAt = Date.now();
    const model = request.model ?? this.#model;
    const language = request.providerLanguage ?? this.#providerLanguage;
    const query = new URLSearchParams({ model, language, smart_format: 'true', punctuate: 'true' });
    for (const keyterm of request.keyterms ?? []) query.append('keyterm', keyterm);
    addRawAudioQuery(query, request.audioFormat);
    const response = await checkedProviderFetch(
      this.id,
      `https://api.deepgram.com/v1/listen?${query.toString()}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.config.apiKey}`,
          'Content-Type': contentType(request.audioFormat),
        },
        body: Buffer.from(request.audio),
      },
      context,
    );
    const body = (await response.json()) as DeepgramResponse;
    const alternative = body.results?.channels?.[0]?.alternatives?.[0];
    if (!alternative) {
      throw new ProviderError({
        code: 'DEEPGRAM_MALFORMED_RESPONSE',
        message: 'Deepgram returned no transcription alternative.',
        provider: this.id,
        failureClass: 'NON_RETRYABLE',
      });
    }
    return {
      data: parseAlternative(alternative, language),
      metadata: providerMetadata({
        model,
        startedAt,
        language,
        ...(body.metadata?.request_id ? { requestId: body.metadata.request_id } : {}),
        ...(body.metadata?.duration === undefined ? {} : { duration: body.metadata.duration }),
      }),
    };
  }

  async connect(
    request: StreamingSpeechToTextRequest,
    context: ProviderRequestContext,
  ): Promise<StreamingSpeechToTextSession> {
    const query = new URLSearchParams({
      model: request.model ?? this.#model,
      language: request.providerLanguage ?? this.#providerLanguage,
      interim_results: 'true',
      punctuate: 'true',
      smart_format: 'true',
      vad_events: 'true',
      utterance_end_ms: '1000',
      endpointing: String(request.endpointingMs ?? this.#endpointingMs),
    });
    for (const keyterm of request.keyterms ?? []) query.append('keyterm', keyterm);
    addRawAudioQuery(query, request.audioFormat);
    const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${query.toString()}`, {
      headers: { Authorization: `Token ${this.config.apiKey}` },
    });
    const signal = providerAbortSignal(context);
    await new Promise<void>((resolve, reject) => {
      const abort = (): void => {
        socket.terminate();
        reject(
          new ProviderError({
            code: 'DEEPGRAM_CONNECT_TIMEOUT',
            message: 'Deepgram streaming connection timed out.',
            provider: this.id,
            failureClass: 'RETRYABLE',
          }),
        );
      };
      signal.addEventListener('abort', abort, { once: true });
      socket.once('open', () => {
        signal.removeEventListener('abort', abort);
        resolve();
      });
      socket.once('error', (error) => {
        signal.removeEventListener('abort', abort);
        reject(normalizeProviderSocketError(this.id, error));
      });
    });
    return new DeepgramStreamingSession(socket, request);
  }

  health(): Promise<{ healthy: boolean; reason?: string }> {
    return Promise.resolve(
      this.config.apiKey ? { healthy: true } : { healthy: false, reason: 'missing credential' },
    );
  }
}
