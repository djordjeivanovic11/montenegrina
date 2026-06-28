import type { ConversationState } from './index.js';

const transitions: Readonly<Record<ConversationState, ReadonlySet<ConversationState>>> = {
  INITIALIZING: new Set(['LISTENING', 'FAILED']),
  LISTENING: new Set(['TRANSCRIBING', 'HANDOFF_PENDING', 'COMPLETED', 'FAILED']),
  TRANSCRIBING: new Set(['LISTENING', 'THINKING', 'COMPLETED', 'FAILED']),
  THINKING: new Set(['TOOL_PENDING', 'SPEAKING', 'LISTENING', 'HANDOFF_PENDING', 'FAILED']),
  TOOL_PENDING: new Set(['THINKING', 'HANDOFF_PENDING', 'FAILED']),
  SPEAKING: new Set(['LISTENING', 'INTERRUPTED', 'HANDOFF_PENDING', 'COMPLETED', 'FAILED']),
  INTERRUPTED: new Set(['LISTENING', 'TRANSCRIBING', 'FAILED']),
  HANDOFF_PENDING: new Set(['HANDED_OFF', 'LISTENING', 'FAILED']),
  HANDED_OFF: new Set(['COMPLETED', 'FAILED']),
  COMPLETED: new Set(),
  FAILED: new Set(),
};

export class InvalidStateTransitionError extends Error {
  readonly code = 'INVALID_CONVERSATION_STATE_TRANSITION';
  constructor(
    readonly from: ConversationState,
    readonly to: ConversationState,
  ) {
    super(`Invalid conversation state transition: ${from} -> ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

export function canTransition(from: ConversationState, to: ConversationState): boolean {
  return transitions[from].has(to);
}

export function transition(from: ConversationState, to: ConversationState): ConversationState {
  if (!canTransition(from, to)) throw new InvalidStateTransitionError(from, to);
  return to;
}

export function validTransitions(from: ConversationState): ConversationState[] {
  return [...transitions[from]];
}

