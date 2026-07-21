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
    state = reduce(state, 'audio.started');
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
    state = reduce(state, 'audio.started');
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
    expect(state.userInputOpen).toBe(false);
  });

  it('ignores late STT finals after an authoritative user turn completes', () => {
    let state = initialVoiceTranscriptState();
    state = reduce(state, 'audio.started');
    state = reduce(state, 'transcription.final', { text: 'Pomaže,' });
    state = reduce(state, 'user.turn.completed', {
      text: 'Pomaže, treba mi rezervacija.',
    });
    state = reduce(state, 'transcription.final', { text: 'druga zakašnjela fraza' });

    const userMessages = state.messages.filter((message) => message.role === 'user');
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]?.content).toBe('Pomaže, treba mi rezervacija.');
    expect(userMessages[0]?.streaming).toBe(false);
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

  it('preserves spaces across streamed assistant deltas', () => {
    let state = initialVoiceTranscriptState();
    const speechId = 'speech-spaces';

    state = reduce(state, 'assistant.audio.started', { speechId });
    state = reduce(state, 'assistant.text.delta', { speechId, text: 'LLM' });
    state = reduce(state, 'assistant.text.delta', { speechId, text: ' je' });
    state = reduce(state, 'assistant.text.delta', { speechId, text: ' veliki' });

    const assistantMessage = state.messages.find((message) => message.role === 'assistant');
    expect(assistantMessage?.content).toBe('LLM je veliki');
    expect(assistantMessage?.streaming).toBe(true);
  });

  it('infers spaces when streamed assistant deltas arrive as bare words', () => {
    let state = initialVoiceTranscriptState();
    const speechId = 'speech-bare-words';

    state = reduce(state, 'assistant.audio.started', { speechId });
    for (const text of ['LLM', 'je', 'skraćenica', 'za', 'Large', 'Language', 'Model,', 'odnosno']) {
      state = reduce(state, 'assistant.text.delta', { speechId, text });
    }

    const assistantMessage = state.messages.find((message) => message.role === 'assistant');
    expect(assistantMessage?.content).toBe(
      'LLM je skraćenica za Large Language Model, odnosno',
    );
  });

  it('keeps a better-spaced streamed assistant draft over a glued final event', () => {
    let state = initialVoiceTranscriptState();
    const speechId = 'speech-glued-final';

    state = reduce(state, 'assistant.audio.started', { speechId });
    for (const text of ['LLM', 'je', 'skraćenica', 'za', 'Large', 'Language', 'Model']) {
      state = reduce(state, 'assistant.text.delta', { speechId, text });
    }
    state = reduce(state, 'assistant.text.completed', {
      speechId,
      text: 'LLMjeskraćenicazaLargeLanguageModel',
    });

    const assistantMessage = state.messages.find((message) => message.role === 'assistant');
    expect(assistantMessage?.content).toBe('LLM je skraćenica za Large Language Model');
    expect(assistantMessage?.streaming).toBe(false);
  });

  it('ignores turn.started for user finalization', () => {
    let state = initialVoiceTranscriptState();
    state = reduce(state, 'audio.started');
    state = reduce(state, 'transcription.final', { text: 'Pomaže,' });
    state = reduce(state, 'turn.started');

    const userBubble = state.messages.find((message) => message.role === 'user');
    expect(userBubble?.content).toBe('Pomaže,');
    expect(userBubble?.streaming).toBe(true);
    expect(state.userDraftId).not.toBeNull();
  });

  it('keeps consecutive authoritative user turns as separate messages', () => {
    let state = initialVoiceTranscriptState();
    state = reduce(state, 'user.turn.completed', { text: 'Da kucu koga!' });
    state = reduce(state, 'user.turn.completed', {
      text: 'Treba da mi kazes mogucu da registrujem drustvo.',
    });

    const userMessages = state.messages.filter((message) => message.role === 'user');
    expect(userMessages).toHaveLength(2);
    expect(userMessages[0]?.content).toContain('Da kucu koga!');
    expect(userMessages[1]?.content).toContain('registrujem drustvo.');
  });

  it('does not reopen the last completed user bubble for STT without new speech', () => {
    let state = initialVoiceTranscriptState();
    state = reduce(state, 'user.turn.completed', { text: 'Prvi segment.' });
    state = reduce(state, 'transcription.partial', { text: 'Drugi segment' });

    const userMessages = state.messages.filter((message) => message.role === 'user');
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]?.content).toBe('Prvi segment.');
    expect(userMessages[0]?.streaming).toBe(false);
  });

  it('preserves finalized messages when preparing a new voice session', () => {
    let state = initialVoiceTranscriptState();
    state = voiceTranscriptReducer(state, {
      type: 'message.add',
      message: {
        id: 'existing',
        role: 'assistant',
        content: 'Ranija poruka',
        ts: 1,
      },
    });
    state = reduce(state, 'audio.started');
    state = reduce(state, 'transcription.partial', { text: 'nedovršeno' });

    state = voiceTranscriptReducer(state, { type: 'session.prepare' });

    expect(state.messages).toEqual([
      {
        id: 'existing',
        role: 'assistant',
        content: 'Ranija poruka',
        ts: 1,
      },
    ]);
    expect(state.userDraftId).toBeNull();
  });

  it('does not create a duplicate assistant bubble when text arrives before audio start', () => {
    let state = initialVoiceTranscriptState();
    const speechId = 'speech-greeting';

    state = reduce(state, 'assistant.text.completed', {
      speechId,
      text: 'Zdravo, kako mogu pomoći?',
    });
    state = reduce(state, 'assistant.audio.started', { speechId });
    state = reduce(state, 'assistant.text.completed', {
      speechId,
      text: 'Zdravo, kako mogu pomoći?',
    });

    const assistantMessages = state.messages.filter((message) => message.role === 'assistant');
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]?.content).toBe('Zdravo, kako mogu pomoći?');
    expect(assistantMessages[0]?.streaming).toBe(false);
  });
});
