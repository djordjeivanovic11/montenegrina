import { createHash } from 'node:crypto';

import {
  ProviderError,
  type AudioFormat,
  type LanguageModelRequest,
  type ProviderRequestContext,
  type RealtimeProviderEvent,
  type RealtimeSpeechProvider,
  type RealtimeSpeechSession,
  type ToolCall,
} from '@montenegrina/provider-core';
import WebSocket from 'ws';

import { AsyncEventQueue } from '../async-event-queue.js';
import {
  normalizeProviderSocketError,
  providerAbortSignal,
  providerString,
} from '../provider-errors.js';

export interface OpenAIRealtimeConfig {
  apiKey: string;
  model?: string;
  voice?: string;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  baseUrl?: string;
}

function openAiAudioFormat(format: AudioFormat): string {
  if (format.channels !== 1) {
    throw new ProviderError({
      code: 'OPENAI_REALTIME_MONO_REQUIRED',
      message: 'OpenAI Realtime requires mono audio.',
      provider: 'openai-realtime',
      failureClass: 'NON_RETRYABLE',
    });
  }
  if (format.encoding === 'pcm_s16le' && format.sampleRate === 24_000) return 'pcm16';
  if (format.encoding === 'mulaw' && format.sampleRate === 8_000) return 'g711_ulaw';
  throw new ProviderError({
    code: 'OPENAI_REALTIME_AUDIO_FORMAT_UNSUPPORTED',
    message: 'OpenAI Realtime requires 24 kHz PCM16 or 8 kHz G.711 mu-law.',
    provider: 'openai-realtime',
    failureClass: 'NON_RETRYABLE',
  });
}

class OpenAIRealtimeSession implements RealtimeSpeechSession {
  readonly #events = new AsyncEventQueue<RealtimeProviderEvent>();
  #closed = false;

  constructor(
    private readonly socket: WebSocket,
    private readonly inputFormat: AudioFormat,
    private readonly outputFormat: AudioFormat,
  ) {
    socket.on('message', (message) => this.handleMessage(providerString(message)));
    socket.on('error', (error) =>
      this.#events.push({
        type: 'error',
        error: normalizeProviderSocketError('openai-realtime', error),
      }),
    );
    socket.on('close', () => {
      this.#closed = true;
      this.#events.close();
    });
  }

  async sendAudio(frame: Parameters<RealtimeSpeechSession['sendAudio']>[0]): Promise<void> {
    if (this.#closed || this.socket.readyState !== WebSocket.OPEN) {
      throw new ProviderError({
        code: 'OPENAI_REALTIME_SESSION_CLOSED',
        message: 'OpenAI Realtime session is closed.',
        provider: 'openai-realtime',
        failureClass: 'RETRYABLE',
      });
    }
    if (
      frame.format.encoding !== this.inputFormat.encoding ||
      frame.format.sampleRate !== this.inputFormat.sampleRate ||
      frame.format.channels !== this.inputFormat.channels
    ) {
      throw new ProviderError({
        code: 'OPENAI_REALTIME_AUDIO_FORMAT_CHANGED',
        message: 'Audio format cannot change during a realtime session.',
        provider: 'openai-realtime',
        failureClass: 'NON_RETRYABLE',
      });
    }
    await this.send({
      type: 'input_audio_buffer.append',
      audio: Buffer.from(frame.bytes).toString('base64'),
    });
  }

  events(): AsyncIterable<RealtimeProviderEvent> {
    return this.#events.iterate();
  }

  async interrupt(): Promise<void> {
    if (this.#closed) return;
    await this.send({ type: 'response.cancel' });
    this.#events.push({ type: 'interrupted' });
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.socket.terminate();
        resolve();
      }, 1_000);
      this.socket.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.close(1000, 'session completed');
    });
  }

  private async send(message: Record<string, unknown>): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.send(JSON.stringify(message), (error) => (error ? reject(error) : resolve()));
    });
  }

  private handleMessage(raw: string): void {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      this.#events.push({
        type: 'error',
        error: new ProviderError({
          code: 'OPENAI_REALTIME_MALFORMED_EVENT',
          message: 'OpenAI Realtime returned malformed data.',
          provider: 'openai-realtime',
          failureClass: 'NON_RETRYABLE',
          cause: error,
        }),
      });
      return;
    }
    const type = providerString(event.type);
    switch (type) {
      case 'input_audio_buffer.speech_started':
        this.#events.push({ type: 'speech.started' });
        break;
      case 'input_audio_buffer.speech_stopped':
        this.#events.push({ type: 'speech.stopped' });
        break;
      case 'conversation.item.input_audio_transcription.delta':
        this.#events.push({ type: 'transcription.partial', text: providerString(event.delta) });
        break;
      case 'conversation.item.input_audio_transcription.completed':
        this.#events.push({ type: 'transcription.final', text: providerString(event.transcript) });
        break;
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
        this.#events.push({ type: 'response.text.delta', delta: providerString(event.delta) });
        break;
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        this.#events.push({
          type: 'response.audio.delta',
          bytes: Buffer.from(providerString(event.delta), 'base64'),
          format: this.outputFormat,
        });
        break;
      case 'response.function_call_arguments.done': {
        try {
          const call: ToolCall = {
            id: providerString(event.call_id, crypto.randomUUID()),
            name: providerString(event.name),
            arguments: JSON.parse(providerString(event.arguments, '{}')) as Record<string, unknown>,
          };
          this.#events.push({ type: 'tool.call', call });
        } catch (error) {
          this.#events.push({
            type: 'error',
            error: new ProviderError({
              code: 'OPENAI_REALTIME_TOOL_ARGUMENTS_INVALID',
              message: 'OpenAI Realtime returned invalid tool arguments.',
              provider: 'openai-realtime',
              failureClass: 'NON_RETRYABLE',
              cause: error,
            }),
          });
        }
        break;
      }
      case 'response.done':
        this.#events.push({ type: 'response.completed' });
        break;
      case 'error': {
        const details = event.error as { code?: string } | undefined;
        this.#events.push({
          type: 'error',
          error: new ProviderError({
            code: details?.code ?? 'OPENAI_REALTIME_ERROR',
            message: 'OpenAI Realtime reported an error.',
            provider: 'openai-realtime',
            failureClass: 'RETRYABLE',
          }),
        });
        break;
      }
    }
  }
}

export class OpenAIRealtimeSpeechProvider implements RealtimeSpeechProvider {
  readonly id = 'openai-realtime';
  readonly #model: string;
  readonly #baseUrl: string;

  constructor(private readonly config: OpenAIRealtimeConfig) {
    this.#model = config.model ?? 'gpt-realtime-2';
    this.#baseUrl = config.baseUrl ?? 'wss://api.openai.com/v1/realtime';
  }

  async connect(
    request: {
      model?: string;
      instructions: string;
      inputFormat: AudioFormat;
      outputFormat: AudioFormat;
      tools?: LanguageModelRequest['tools'];
    },
    context: ProviderRequestContext,
  ): Promise<RealtimeSpeechSession> {
    const model = request.model ?? this.#model;
    const inputAudioFormat = openAiAudioFormat(request.inputFormat);
    const outputAudioFormat = openAiAudioFormat(request.outputFormat);
    const safetyIdentifier = createHash('sha256').update(context.organizationId).digest('hex');
    const socket = new WebSocket(`${this.#baseUrl}?model=${encodeURIComponent(model)}`, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'OpenAI-Safety-Identifier': safetyIdentifier,
      },
    });
    const signal = providerAbortSignal(context);
    await new Promise<void>((resolve, reject) => {
      const abort = (): void => {
        socket.terminate();
        reject(
          new ProviderError({
            code: 'OPENAI_REALTIME_CONNECT_TIMEOUT',
            message: 'OpenAI Realtime connection timed out.',
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
    socket.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          type: 'realtime',
          model,
          instructions: request.instructions,
          modalities: ['audio', 'text'],
          input_audio_format: inputAudioFormat,
          output_audio_format: outputAudioFormat,
          input_audio_transcription: { model: 'gpt-realtime-whisper' },
          turn_detection: { type: 'server_vad', create_response: true, interrupt_response: true },
          voice: this.config.voice ?? 'marin',
          reasoning: { effort: this.config.reasoningEffort ?? 'none' },
          tools: request.tools?.map((tool) => ({
            type: 'function',
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          })),
          tool_choice: 'auto',
        },
      }),
    );
    return new OpenAIRealtimeSession(socket, request.inputFormat, request.outputFormat);
  }

  health(): Promise<{ healthy: boolean; reason?: string }> {
    return Promise.resolve(
      this.config.apiKey ? { healthy: true } : { healthy: false, reason: 'missing credential' },
    );
  }
}
