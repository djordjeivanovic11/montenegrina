export const languageCode = 'cnr' as const;
export type LanguageCode = typeof languageCode;

export const realtimeEventTypes = [
  'session.started',
  'audio.started',
  'transcription.partial',
  'transcription.final',
  'turn.started',
  'assistant.text.delta',
  'assistant.text.completed',
  'assistant.audio.started',
  'assistant.audio.chunk',
  'assistant.audio.completed',
  'assistant.interrupted',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'handoff.requested',
  'handoff.completed',
  'session.completed',
  'error',
] as const;

export type RealtimeEventType = (typeof realtimeEventTypes)[number];

export type ConversationState =
  | 'INITIALIZING'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'THINKING'
  | 'TOOL_PENDING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'HANDOFF_PENDING'
  | 'HANDED_OFF'
  | 'COMPLETED'
  | 'FAILED';

export interface RealtimeEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  eventId: string;
  type: RealtimeEventType;
  timestamp: string;
  organizationId: string;
  agentId: string;
  conversationId: string;
  turnId?: string;
  traceId: string;
  sequence: number;
  payload: TPayload;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}

export type ToolRiskClass =
  | 'READ_PUBLIC'
  | 'READ_CUSTOMER'
  | 'WRITE_REVERSIBLE'
  | 'WRITE_SENSITIVE';

export interface Citation {
  documentId: string;
  documentVersionId: string;
  chunkId: string;
  title: string;
  page?: number;
  section?: string;
  score?: number;
}

export * from './state-machine.js';
