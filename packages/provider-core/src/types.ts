export type ProviderKind = 'stt' | 'llm' | 'tts' | 'realtime' | 'embedding';
export type FailureClass = 'RETRYABLE' | 'NON_RETRYABLE' | 'ESCALATION_REQUIRED';

export interface ProviderRequestContext {
  requestId: string;
  traceId: string;
  organizationId: string;
  agentId?: string;
  conversationId?: string;
  timeoutMs: number;
  signal?: AbortSignal;
  dataPolicy: {
    allowedProviders: readonly string[];
    allowedRegions: readonly string[];
    allowFallback: boolean;
  };
}

export interface ProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  audioInputSeconds?: number;
  audioOutputSeconds?: number;
  characters?: number;
  estimatedCostUsd?: number;
}

export interface ProviderMetadata {
  provider: string;
  model: string;
  region?: string;
  requestId?: string;
  latencyMs: number;
  usage: ProviderUsage;
  attributes: Record<string, string | number | boolean | null>;
  fallbackHistory?: Array<{ provider: string; code: string; retryable: boolean }>;
}

export interface ProviderResult<T> {
  data: T;
  metadata: ProviderMetadata;
}

export class ProviderError extends Error {
  readonly code: string;
  readonly provider: string;
  readonly failureClass: FailureClass;
  readonly statusCode: number | undefined;
  readonly safeDetails: Record<string, unknown> | undefined;

  constructor(options: {
    code: string;
    message: string;
    provider: string;
    failureClass: FailureClass;
    statusCode?: number;
    safeDetails?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'ProviderError';
    this.code = options.code;
    this.provider = options.provider;
    this.failureClass = options.failureClass;
    this.statusCode = options.statusCode;
    this.safeDetails = options.safeDetails;
  }

  get retryable(): boolean {
    return this.failureClass === 'RETRYABLE';
  }
}

export interface TranscriptWord {
  word: string;
  startMs: number;
  endMs: number;
  confidence?: number;
}

export type AudioEncoding = 'pcm_s16le' | 'mulaw' | 'wav' | 'mp3' | 'opus';

export interface AudioFormat {
  encoding: AudioEncoding;
  sampleRate: number;
  channels: number;
}

export interface AudioFrame {
  bytes: Uint8Array;
  format: AudioFormat;
  timestampMs?: number;
}

export interface TranscriptionResult {
  text: string;
  providerLanguage: string;
  confidence?: number;
  words: TranscriptWord[];
}

export interface SpeechToTextRequest {
  audio: Uint8Array;
  audioFormat: AudioFormat;
  providerLanguage: 'sr' | 'hr' | 'bs' | 'multi';
  model?: string;
  keyterms?: readonly string[];
}

export interface StreamingSpeechToTextRequest {
  audioFormat: AudioFormat;
  providerLanguage: 'sr' | 'hr' | 'bs' | 'multi';
  model?: string;
  keyterms?: readonly string[];
  endpointingMs?: number;
}

export type SpeechToTextStreamEvent =
  | { type: 'transcription.partial'; text: string; receivedAtMs: number }
  | { type: 'transcription.final'; result: TranscriptionResult; receivedAtMs: number }
  | { type: 'speech.started'; receivedAtMs: number }
  | { type: 'speech.ended'; receivedAtMs: number }
  | { type: 'error'; error: ProviderError; receivedAtMs: number };

export interface StreamingSpeechToTextSession {
  sendAudio(chunk: AudioFrame): Promise<void>;
  events(): AsyncIterable<SpeechToTextStreamEvent>;
  close(): Promise<void>;
}

export interface SpeechToTextProvider {
  readonly id: string;
  transcribe(
    request: SpeechToTextRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<TranscriptionResult>>;
  connect?(
    request: StreamingSpeechToTextRequest,
    context: ProviderRequestContext,
  ): Promise<StreamingSpeechToTextSession>;
  health(): Promise<{ healthy: boolean; reason?: string }>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LanguageModelRequest {
  system: string;
  messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }>;
  model?: string;
  tools?: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  maxOutputTokens?: number;
}

export type LanguageModelStreamEvent =
  | { type: 'text.delta'; delta: string }
  | { type: 'tool.call'; call: ToolCall }
  | { type: 'completed'; text: string; toolCalls: ToolCall[]; metadata: ProviderMetadata };

export interface LanguageModelResult {
  text: string;
  toolCalls: ToolCall[];
}

export interface LanguageModelProvider {
  readonly id: string;
  generate(
    request: LanguageModelRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<LanguageModelResult>>;
  stream(
    request: LanguageModelRequest,
    context: ProviderRequestContext,
  ): AsyncIterable<LanguageModelStreamEvent>;
  health(): Promise<{ healthy: boolean; reason?: string }>;
}

export interface TextToSpeechRequest {
  text: string;
  model?: string;
  voiceId?: string;
  outputFormat: AudioFormat;
  pronunciationDictionaryIds?: readonly string[];
}

export interface AudioChunk {
  bytes: Uint8Array;
  sequence: number;
  format: AudioFormat;
  final: boolean;
}

export interface TextToSpeechProvider {
  readonly id: string;
  synthesize(
    request: TextToSpeechRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<Uint8Array>>;
  stream(
    request: TextToSpeechRequest,
    context: ProviderRequestContext,
  ): AsyncIterable<AudioChunk>;
  health(): Promise<{ healthy: boolean; reason?: string }>;
}

export interface EmbeddingRequest {
  texts: readonly string[];
  model?: string;
}

export interface EmbeddingProvider {
  readonly id: string;
  embed(
    request: EmbeddingRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<number[][]>>;
  health(): Promise<{ healthy: boolean; reason?: string }>;
}

export interface RealtimeSpeechSession {
  sendAudio(chunk: AudioFrame): Promise<void>;
  events(): AsyncIterable<RealtimeProviderEvent>;
  interrupt(): Promise<void>;
  close(): Promise<void>;
}

export type RealtimeProviderEvent =
  | { type: 'transcription.partial'; text: string }
  | { type: 'transcription.final'; text: string }
  | { type: 'response.text.delta'; delta: string }
  | { type: 'response.audio.delta'; bytes: Uint8Array; format: AudioFormat }
  | { type: 'response.completed' }
  | { type: 'tool.call'; call: ToolCall }
  | { type: 'speech.started' }
  | { type: 'speech.stopped' }
  | { type: 'interrupted' }
  | { type: 'error'; error: ProviderError };

export interface RealtimeSpeechProvider {
  readonly id: string;
  connect(
    request: {
      model?: string;
      instructions: string;
      inputFormat: AudioFormat;
      outputFormat: AudioFormat;
      tools?: LanguageModelRequest['tools'];
    },
    context: ProviderRequestContext,
  ): Promise<RealtimeSpeechSession>;
  health(): Promise<{ healthy: boolean; reason?: string }>;
}
