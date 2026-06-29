import type { Message } from '../components/conversation-area';

export type VoiceTranscriptState = {
  messages: Message[];
  userDraftId: string | null;
  userCommitted: string;
  userLivePartial: string;
  assistantDrafts: Record<string, { id: string; content: string }>;
};

export type VoiceTranscriptAction =
  | { type: 'session.reset' }
  | { type: 'message.add'; message: Message }
  | { type: 'voice.event'; event: { type: string; payload: Record<string, unknown> } };

export const initialVoiceTranscriptState = (): VoiceTranscriptState => ({
  messages: [],
  userDraftId: null,
  userCommitted: '',
  userLivePartial: '',
  assistantDrafts: {},
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

function userMessagesSinceLastAssistant(messages: Message[]): Message[] {
  const lastAssistantIndex = messages.map((message) => message.role).lastIndexOf('assistant');
  return messages
    .slice(lastAssistantIndex + 1)
    .filter((message) => message.role === 'user');
}

function mergeUserTurnMessages(
  messages: Message[],
  draftId: string,
  finalText: string,
  draftTs?: number,
): Message[] {
  const priorUsers = userMessagesSinceLastAssistant(messages).filter(
    (message) => message.id !== draftId,
  );
  if (priorUsers.length === 0) {
    return upsertMessage(messages, draftId, 'user', finalText, false, draftTs);
  }

  const keepId = priorUsers[0].id;
  const merged = trimDisplay(
    priorUsers.map((message) => message.content).join(' '),
    finalText,
  );
  const removeIds = new Set(
    [...priorUsers.slice(1).map((message) => message.id), draftId].filter(
      (id) => id !== keepId,
    ),
  );
  const kept = messages.find((message) => message.id === keepId);
  const withoutRemoved = messages.filter((message) => !removeIds.has(message.id));
  return upsertMessage(withoutRemoved, keepId, 'user', merged, false, kept?.ts ?? draftTs);
}

function resolveUserDraftState(state: VoiceTranscriptState): {
  userDraftId: string;
  userCommitted: string;
} {
  if (state.userDraftId) {
    return { userDraftId: state.userDraftId, userCommitted: state.userCommitted };
  }
  const priorUsers = userMessagesSinceLastAssistant(state.messages);
  const lastUser = priorUsers[priorUsers.length - 1];
  if (lastUser) {
    return { userDraftId: lastUser.id, userCommitted: lastUser.content };
  }
  return { userDraftId: crypto.randomUUID(), userCommitted: '' };
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

function applyVoiceEvent(
  state: VoiceTranscriptState,
  event: { type: string; payload: Record<string, unknown> },
): VoiceTranscriptState {
  const text = typeof event.payload.text === 'string' ? event.payload.text : '';
  const speechId = typeof event.payload.speechId === 'string' ? event.payload.speechId : null;

  switch (event.type) {
    case 'transcription.partial': {
      const segment = text.trim();
      if (!segment) return state;
      const { userDraftId, userCommitted } = resolveUserDraftState(state);
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
      const { userDraftId, userCommitted } = resolveUserDraftState(state);
      const nextCommitted = trimDisplay(userCommitted, segment);
      return {
        ...state,
        userDraftId,
        userCommitted: nextCommitted,
        userLivePartial: '',
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
        messages: mergeUserTurnMessages(
          state.messages,
          userDraftId,
          finalText,
          existing?.ts,
        ),
      };
    }

    case 'assistant.audio.started': {
      const resolvedSpeechId = speechId ?? crypto.randomUUID();
      if (state.assistantDrafts[resolvedSpeechId]) return state;
      const id = crypto.randomUUID();
      return {
        ...state,
        assistantDrafts: {
          ...state.assistantDrafts,
          [resolvedSpeechId]: { id, content: '' },
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
          assistantDrafts: { [newSpeechId]: { id, content: text } },
          messages: upsertMessage(state.messages, id, 'assistant', text, true),
        };
      }
      const draft = state.assistantDrafts[resolvedSpeechId];
      const id = draft?.id ?? crypto.randomUUID();
      const merged = `${draft?.content ?? ''}${text}`;
      return {
        ...state,
        assistantDrafts: {
          ...state.assistantDrafts,
          [resolvedSpeechId]: { id, content: merged },
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
      const id = draft?.id ?? crypto.randomUUID();
      const content = finalText || draft?.content || '';
      if (!content) {
        const { [resolvedSpeechId]: _removed, ...restDrafts } = state.assistantDrafts;
        return {
          ...state,
          assistantDrafts: restDrafts,
          messages: draft?.id ? removeMessage(state.messages, draft.id) : state.messages,
        };
      }
      const { [resolvedSpeechId]: _removed, ...restDrafts } = state.assistantDrafts;
      return {
        ...state,
        assistantDrafts: restDrafts,
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
    case 'message.add':
      return { ...state, messages: [...state.messages, action.message] };
    case 'voice.event':
      return applyVoiceEvent(state, action.event);
    default:
      return state;
  }
}
