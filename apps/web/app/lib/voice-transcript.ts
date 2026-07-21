import type { Message } from '../components/conversation-area';

export type VoiceTranscriptState = {
  messages: Message[];
  userDraftId: string | null;
  userCommitted: string;
  userLivePartial: string;
  userInputOpen: boolean;
  assistantDrafts: Record<string, { id: string; content: string }>;
  assistantSpeechMessageIds: Record<string, string>;
  assistantCompletedSpeechIds: Record<string, true>;
};

export type VoiceTranscriptAction =
  | { type: 'session.reset' }
  | { type: 'session.prepare' }
  | { type: 'message.add'; message: Message }
  | { type: 'voice.event'; event: { type: string; payload: Record<string, unknown> } };

export const initialVoiceTranscriptState = (): VoiceTranscriptState => ({
  messages: [],
  userDraftId: null,
  userCommitted: '',
  userLivePartial: '',
  userInputOpen: false,
  assistantDrafts: {},
  assistantSpeechMessageIds: {},
  assistantCompletedSpeechIds: {},
});

function trimDisplay(committed: string, partial: string): string {
  return [committed.trim(), partial.trim()].filter(Boolean).join(' ');
}

function upsertMessage(
  messages: Message[],
  id: string,
  role: Message['role'],
  content: string,
  streaming: boolean,
  ts?: number,
): Message[] {
  const without = messages.filter((message) => message.id !== id);
  const existing = messages.find((message) => message.id === id);
  return [
    ...without,
    {
      id,
      role,
      content,
      ts: ts ?? existing?.ts ?? Date.now(),
      streaming,
    },
  ];
}

function removeMessage(messages: Message[], id: string): Message[] {
  return messages.filter((message) => message.id !== id);
}

function finalizeAssistantDrafts(state: VoiceTranscriptState): VoiceTranscriptState {
  let messages = state.messages;
  for (const draft of Object.values(state.assistantDrafts)) {
    messages = messages.map((message) =>
      message.id === draft.id ? { ...message, streaming: false } : message,
    );
  }
  return { ...state, messages, assistantDrafts: {} };
}

function prepareForVoiceSession(state: VoiceTranscriptState): VoiceTranscriptState {
  const finalized = finalizeAssistantDrafts(state);
  const messages = state.userDraftId
    ? finalized.messages.filter((message) => message.id !== state.userDraftId)
    : finalized.messages;
  return {
    ...finalized,
    messages,
    userDraftId: null,
    userCommitted: '',
    userLivePartial: '',
    userInputOpen: false,
    assistantSpeechMessageIds: {},
    assistantCompletedSpeechIds: {},
  };
}

function applyVoiceEvent(
  state: VoiceTranscriptState,
  event: { type: string; payload: Record<string, unknown> },
): VoiceTranscriptState {
  const text = typeof event.payload.text === 'string' ? event.payload.text : '';
  const speechId = typeof event.payload.speechId === 'string' ? event.payload.speechId : null;

  switch (event.type) {
    case 'audio.started': {
      if (state.userDraftId && state.userInputOpen) return state;
      return {
        ...state,
        userDraftId: crypto.randomUUID(),
        userCommitted: '',
        userLivePartial: '',
        userInputOpen: true,
      };
    }

    case 'transcription.partial': {
      const segment = text.trim();
      if (!segment) return state;
      if (!state.userInputOpen || !state.userDraftId) return state;
      const userDraftId = state.userDraftId;
      const userCommitted = state.userCommitted;
      const display = trimDisplay(userCommitted, segment);
      return {
        ...state,
        userDraftId,
        userCommitted,
        userLivePartial: segment,
        messages: upsertMessage(state.messages, userDraftId, 'user', display, true),
      };
    }

    case 'transcription.final': {
      const segment = text.trim();
      if (!segment) return state;
      if (!state.userInputOpen || !state.userDraftId) return state;
      const userDraftId = state.userDraftId;
      const userCommitted = state.userCommitted;
      const nextCommitted = trimDisplay(userCommitted, segment);
      return {
        ...state,
        userDraftId,
        userCommitted: nextCommitted,
        userLivePartial: '',
        userInputOpen: true,
        messages: upsertMessage(state.messages, userDraftId, 'user', nextCommitted, true),
      };
    }

    case 'user.turn.completed': {
      const finalText = text.trim();
      if (!finalText) {
        return {
          ...state,
          userDraftId: null,
          userCommitted: '',
          userLivePartial: '',
          userInputOpen: false,
          messages: state.userDraftId
            ? removeMessage(state.messages, state.userDraftId)
            : state.messages,
        };
      }
      const userDraftId = state.userDraftId ?? crypto.randomUUID();
      const existing = state.messages.find((message) => message.id === userDraftId);
      return {
        ...state,
        userDraftId: null,
        userCommitted: '',
        userLivePartial: '',
        userInputOpen: false,
        messages: upsertMessage(state.messages, userDraftId, 'user', finalText, false, existing?.ts),
      };
    }

    case 'assistant.audio.started': {
      const resolvedSpeechId = speechId ?? crypto.randomUUID();
      if (state.assistantSpeechMessageIds[resolvedSpeechId]) return state;
      if (state.assistantDrafts[resolvedSpeechId]) return state;
      const id = crypto.randomUUID();
      return {
        ...state,
        assistantDrafts: {
          ...state.assistantDrafts,
          [resolvedSpeechId]: { id, content: '' },
        },
        assistantSpeechMessageIds: {
          ...state.assistantSpeechMessageIds,
          [resolvedSpeechId]: id,
        },
        messages: upsertMessage(state.messages, id, 'assistant', '', true),
      };
    }

    case 'assistant.text.delta': {
      if (!text) return state;
      const resolvedSpeechId = speechId ?? Object.keys(state.assistantDrafts)[0];
      if (!resolvedSpeechId) {
        const id = crypto.randomUUID();
        const newSpeechId = speechId ?? crypto.randomUUID();
        return {
          ...state,
          assistantDrafts: {
            ...state.assistantDrafts,
            [newSpeechId]: { id, content: text },
          },
          assistantSpeechMessageIds: {
            ...state.assistantSpeechMessageIds,
            [newSpeechId]: id,
          },
          messages: upsertMessage(state.messages, id, 'assistant', text, true),
        };
      }
      if (state.assistantCompletedSpeechIds[resolvedSpeechId]) return state;
      const draft = state.assistantDrafts[resolvedSpeechId];
      const existingId = state.assistantSpeechMessageIds[resolvedSpeechId];
      const id = draft?.id ?? existingId ?? crypto.randomUUID();
      const existingContent = state.messages.find((message) => message.id === id)?.content ?? '';
      const merged = `${draft?.content ?? existingContent}${text}`;
      return {
        ...state,
        assistantDrafts: {
          ...state.assistantDrafts,
          [resolvedSpeechId]: { id, content: merged },
        },
        assistantSpeechMessageIds: {
          ...state.assistantSpeechMessageIds,
          [resolvedSpeechId]: id,
        },
        messages: upsertMessage(state.messages, id, 'assistant', merged, true),
      };
    }

    case 'assistant.text.completed': {
      const finalText = text.trim();
      const resolvedSpeechId = speechId ?? Object.keys(state.assistantDrafts)[0];
      if (!resolvedSpeechId) {
        if (!finalText) return state;
        const id = crypto.randomUUID();
        return {
          ...state,
          messages: upsertMessage(state.messages, id, 'assistant', finalText, false),
        };
      }
      const draft = state.assistantDrafts[resolvedSpeechId];
      const existingId = state.assistantSpeechMessageIds[resolvedSpeechId];
      const id = draft?.id ?? existingId ?? crypto.randomUUID();
      const existingContent = state.messages.find((message) => message.id === id)?.content ?? '';
      const streamedContent = draft?.content || existingContent || '';
      const content = finalText || streamedContent;
      if (!content) {
        const restDrafts = { ...state.assistantDrafts };
        delete restDrafts[resolvedSpeechId];
        return {
          ...state,
          assistantDrafts: restDrafts,
          messages: draft?.id ? removeMessage(state.messages, draft.id) : state.messages,
        };
      }
      const restDrafts = { ...state.assistantDrafts };
      delete restDrafts[resolvedSpeechId];
      return {
        ...state,
        assistantDrafts: restDrafts,
        assistantSpeechMessageIds: {
          ...state.assistantSpeechMessageIds,
          [resolvedSpeechId]: id,
        },
        assistantCompletedSpeechIds: {
          ...state.assistantCompletedSpeechIds,
          [resolvedSpeechId]: true,
        },
        messages: upsertMessage(state.messages, id, 'assistant', content, false),
      };
    }

    case 'assistant.interrupted':
      return finalizeAssistantDrafts(state);

    case 'assistant.audio.completed':
    case 'turn.started':
      return state;

    default:
      return state;
  }
}

export function voiceTranscriptReducer(
  state: VoiceTranscriptState,
  action: VoiceTranscriptAction,
): VoiceTranscriptState {
  switch (action.type) {
    case 'session.reset':
      return initialVoiceTranscriptState();
    case 'session.prepare':
      return prepareForVoiceSession(state);
    case 'message.add':
      return { ...state, messages: [...state.messages, action.message] };
    case 'voice.event':
      return applyVoiceEvent(state, action.event);
    default:
      return state;
  }
}
