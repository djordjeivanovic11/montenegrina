import {
  ProviderError,
  type AudioChunk,
  type AudioFormat,
  type ProviderRequestContext,
  type ProviderResult,
  type TextToSpeechProvider,
  type TextToSpeechRequest,
} from '@montenegrina/provider-core';

import { checkedProviderFetch } from '../provider-errors.js';

export interface ElevenLabsTextToSpeechConfig {
  apiKey: string;
  model?: string;
  voiceId: string;
  outputFormat?: AudioFormat;
  baseUrl?: string;
}

function elevenOutputFormat(format: AudioFormat): string {
  if (format.channels !== 1) {
    throw new ProviderError({
      code: 'ELEVENLABS_MONO_REQUIRED',
      message: 'ElevenLabs realtime output must be mono.',
      provider: 'elevenlabs',
      failureClass: 'NON_RETRYABLE',
    });
  }
  if (format.encoding === 'mulaw' && format.sampleRate === 8_000) return 'ulaw_8000';
  if ((format.encoding === 'pcm_s16le' || format.encoding === 'wav') && [16_000, 22_050, 24_000, 44_100].includes(format.sampleRate)) {
    return `pcm_${format.sampleRate}`;
  }
  if (format.encoding === 'mp3') return 'mp3_44100_128';
  if (format.encoding === 'opus') return 'opus_48000_64';
  throw new ProviderError({
    code: 'ELEVENLABS_AUDIO_FORMAT_UNSUPPORTED',
    message: 'The requested ElevenLabs audio format is unsupported.',
    provider: 'elevenlabs',
    failureClass: 'NON_RETRYABLE',
  });
}

function wavHeader(dataLength: number, format: AudioFormat): Uint8Array {
  const bitsPerSample = 16;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, 'RIFF');
  view.setUint32(4, dataLength + 36, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, format.channels, true);
  view.setUint32(24, format.sampleRate, true);
  view.setUint32(28, format.sampleRate * format.channels * (bitsPerSample / 8), true);
  view.setUint16(32, format.channels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  write(36, 'data');
  view.setUint32(40, dataLength, true);
  return new Uint8Array(buffer);
}

async function collectStream(response: Response): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export class ElevenLabsTextToSpeechProvider implements TextToSpeechProvider {
  readonly id = 'elevenlabs';
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #defaultFormat: AudioFormat;

  constructor(private readonly config: ElevenLabsTextToSpeechConfig) {
    this.#model = config.model ?? 'eleven_flash_v2_5';
    this.#baseUrl = config.baseUrl ?? 'https://api.elevenlabs.io/v1';
    this.#defaultFormat = config.outputFormat ?? {
      encoding: 'pcm_s16le',
      sampleRate: 24_000,
      channels: 1,
    };
  }

  async synthesize(
    request: TextToSpeechRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<Uint8Array>> {
    const startedAt = Date.now();
    const format = request.outputFormat ?? this.#defaultFormat;
    const response = await this.request(request, format, context);
    const raw = await collectStream(response);
    const bytes =
      format.encoding === 'wav'
        ? Uint8Array.from([...wavHeader(raw.byteLength, format), ...raw])
        : raw;
    return {
      data: bytes,
      metadata: {
        provider: this.id,
        model: request.model ?? this.#model,
        latencyMs: Date.now() - startedAt,
        usage: { characters: request.text.length },
        attributes: {
          voiceId: request.voiceId ?? this.config.voiceId,
          outputFormat: elevenOutputFormat(format),
        },
        ...(response.headers.get('request-id')
          ? { requestId: response.headers.get('request-id') as string }
          : {}),
      },
    };
  }

  async *stream(
    request: TextToSpeechRequest,
    context: ProviderRequestContext,
  ): AsyncIterable<AudioChunk> {
    const format = request.outputFormat ?? this.#defaultFormat;
    if (format.encoding !== 'pcm_s16le' && format.encoding !== 'mulaw') {
      throw new ProviderError({
        code: 'ELEVENLABS_REALTIME_FORMAT_REQUIRED',
        message: 'Realtime TTS requires headerless PCM or mu-law audio.',
        provider: this.id,
        failureClass: 'NON_RETRYABLE',
      });
    }
    const response = await this.request(request, format, context);
    if (!response.body) {
      throw new ProviderError({
        code: 'ELEVENLABS_EMPTY_STREAM',
        message: 'ElevenLabs returned an empty audio stream.',
        provider: this.id,
        failureClass: 'RETRYABLE',
      });
    }
    const reader = response.body.getReader();
    let sequence = 0;
    let pending: Uint8Array | undefined;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (pending) {
          sequence += 1;
          yield { bytes: pending, sequence, format, final: false };
        }
        pending = value;
      }
      if (pending) {
        sequence += 1;
        yield { bytes: pending, sequence, format, final: true };
      }
    } finally {
      reader.releaseLock();
    }
  }

  async health(): Promise<{ healthy: boolean; reason?: string }> {
    return this.config.apiKey && this.config.voiceId
      ? { healthy: true }
      : { healthy: false, reason: 'missing credential or Montenegrin voice ID' };
  }

  private async request(
    request: TextToSpeechRequest,
    format: AudioFormat,
    context: ProviderRequestContext,
  ): Promise<Response> {
    const voiceId = request.voiceId ?? this.config.voiceId;
    if (!voiceId) {
      throw new ProviderError({
        code: 'ELEVENLABS_VOICE_REQUIRED',
        message: 'A Montenegrin-validated ElevenLabs voice must be configured.',
        provider: this.id,
        failureClass: 'NON_RETRYABLE',
      });
    }
    return checkedProviderFetch(
      this.id,
      `${this.#baseUrl}/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=${elevenOutputFormat(format)}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': this.config.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: request.text,
          model_id: request.model ?? this.#model,
          pronunciation_dictionary_locators: request.pronunciationDictionaryIds?.map((id) => ({
            pronunciation_dictionary_id: id,
            version_id: 'latest',
          })),
        }),
      },
      context,
    );
  }
}

