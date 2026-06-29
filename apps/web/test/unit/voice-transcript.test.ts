import { describe, expect, it } from 'vitest';

import {
  initialVoiceTranscriptState,
  voiceTranscriptReducer,
  type VoiceTranscriptState,
} from '../../app/lib/voice-transcript';

function reduce(
  state: VoiceTranscriptState,
  type: string,
  payload: Record<string, unknown> = {},
): VoiceTranscriptState {
  return voiceTranscriptReducer(state, { type: 'voice.event', event: { type, payload } });
}

describe('voiceTranscriptReducer', () => {
  it('keeps committed finals when a partial arrives', () => {
    let state = initialVoiceTranscriptState();
    state = reduce(state, 'transcription.final', { text: 'Pomaže' });
    state = reduce(state, 'transcription.partial', { text: 'ali želim' });

    const userBubble = state.messages.find((message) => message.role === 'user');
    expect(userBubble?.content).toBe('Pomaže ali želim');
    expect(userBubble?.streaming).toBe(true);
    expect(state.userCommitted).toBe('Pomaže');
    expect(state.userLivePartial).toBe('ali želim');
  });

  it('commits the authoritative user turn text', () => {
    let state = initialVoiceTranscriptState();
    state = reduce(state, 'transcription.final', { text: 'Pomaže,' });
    state = reduce(state, 'transcription.partial', { text: 'ali želim' });
    state = reduce(state, 'transcription.final', { text: 'da rezervišem' });
    state = reduce(state, 'user.turn.completed', {
      text: 'Pomaže, ali želim da rezervišem sobu za vikend.',
    });

    const userMessages = state.messages.filter((message) => message.role === 'user');
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]?.content).toBe('Pomaže, ali želim da rezervišem sobu za vikend.');
    expect(userMessages[0]?.streaming).toBe(false);
    expect(state.userDraftId).toBeNull();
    expect(state.userCommitted).toBe('');
    expect(state.userLivePartial).toBe('');
  });

  it('finalizes assistant speech by speechId without duplicate bubbles', () => {
    let state = initialVoiceTranscriptState();
    const speechId = 'speech-1';

    state = reduce(state, 'assistant.audio.started', { speechId });
    state = reduce(state, 'assistant.text.delta', { speechId, text: 'Dobar dan, ' });
    state = reduce(state, 'assistant.text.delta', { speechId, text: 'kako mogu pomoći?' });
    state = reduce(state, 'assistant.audio.completed', { speechId });
    state = reduce(state, 'assistant.text.completed', {
      speechId,
      text: 'Dobar dan, kako mogu pomoći?',
    });

    const assistantMessages = state.messages.filter((message) => message.role === 'assistant');
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]?.content).toBe('Dobar dan, kako mogu pomoći?');
    expect(assistantMessages[0]?.streaming).toBe(false);
    expect(state.assistantDrafts).toEqual({});
  });

  it('ignores turn.started for user finalization', () => {
    let state = initialVoiceTranscriptState();
    state = reduce(state, 'transcription.final', { text: 'Pomaže,' });
    state = reduce(state, 'turn.started');

    const userBubble = state.messages.find((message) => message.role === 'user');
    expect(userBubble?.content).toBe('Pomaže,');
    expect(userBubble?.streaming).toBe(true);
    expect(state.userDraftId).not.toBeNull();
  });

  it('merges consecutive user turns before the agent replies', () => {
    let state = initialVoiceTranscriptState();
    state = reduce(state, 'user.turn.completed', { text: 'Da kucu koga!' });
    state = reduce(state, 'user.turn.completed', {
      text: 'Treba da mi kazes mogucu da registrujem drustvo.',
    });

    const userMessages = state.messages.filter((message) => message.role === 'user');
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]?.content).toContain('Da kucu koga!');
    expect(userMessages[0]?.content).toContain('registrujem drustvo.');
  });

  it('reopens the last user bubble when STT splits a long utterance', () => {
    let state = initialVoiceTranscriptState();
    state = reduce(state, 'user.turn.completed', { text: 'Prvi segment.' });
    state = reduce(state, 'transcription.partial', { text: 'Drugi segment' });

    const userMessages = state.messages.filter((message) => message.role === 'user');
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]?.content).toBe('Prvi segment. Drugi segment');
    expect(userMessages[0]?.streaming).toBe(true);
  });
});
