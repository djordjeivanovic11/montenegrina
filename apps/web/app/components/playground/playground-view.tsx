'use client';

import { createApiClient, type components } from '@montenegrina/sdk-typescript';
import { Room, RoomEvent, Track, type RemoteTrack, type RemoteParticipant } from 'livekit-client';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { Composer } from '../composer';
import { ConversationArea, type Message } from '../conversation-area';
import { DevPanel } from '../dev-panel';
import { KnowledgeSection } from '../knowledge/knowledge-section';
import { TopBar } from '../top-bar';
import { API_URL, apiHeaders, errorMessage } from '../../lib/api-client';
import { useSession } from '../../lib/hooks/use-session';
import { useWorkspace } from '../../lib/hooks/use-workspace';
import { initialVoiceTranscriptState, voiceTranscriptReducer } from '../../lib/voice-transcript';

type Agent = components['schemas']['Agent'];
type RealtimeSession = components['schemas']['RealtimeSession'];

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

export function PlaygroundView() {
  const { csrfToken } = useSession();
  const { organizationId } = useWorkspace();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState('');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [transcriptState, dispatchTranscript] = useReducer(
    voiceTranscriptReducer,
    undefined,
    initialVoiceTranscriptState,
  );
  const messages = transcriptState.messages;
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [isDevOpen, setIsDevOpen] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<'chat' | 'knowledge'>('chat');
  const [phoneTo, setPhoneTo] = useState('');
  const [phoneCallState, setPhoneCallState] = useState<'idle' | 'dialing' | 'done' | 'error'>(
    'idle',
  );
  const [sipConfigured, setSipConfigured] = useState(false);
  const [, setConversations] = useState<
    Array<{
      id: string;
      startedAt: string;
      preview?: string;
    }>
  >([]);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [mneMcpEnabled, setMneMcpEnabled] = useState(false);
  const [mneMcpAvailable, setMneMcpAvailable] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const voiceTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const sessionStartedRef = useRef(false);
  const assistantAudioStartedRef = useRef(false);
  const api = useMemo(() => createApiClient(API_URL), []);

  function clearVoiceTimers(): void {
    for (const timer of voiceTimersRef.current) clearTimeout(timer);
    voiceTimersRef.current = [];
  }

  useEffect(
    () => () => {
      clearVoiceTimers();
      void roomRef.current?.disconnect();
    },
    [],
  );

  const headers = (): Record<string, string> => apiHeaders();

  useEffect(() => {
    if (!csrfToken || !organizationId) return;
    void (async () => {
      const listed = await api.GET('/v1/agents', { headers: headers() });
      if (listed.response.ok && listed.data) {
        setAgents(listed.data.items);
        setAgentId(listed.data.items[0]?.id ?? '');
      }
      const convResponse = await fetch(`${API_URL}/v1/conversations`, {
        headers: headers(),
        credentials: 'include',
      });
      if (convResponse.ok) {
        const convData = (await convResponse.json()) as {
          items: Array<{ id: string; startedAt: string; preview?: string }>;
        };
        setConversations(convData.items ?? []);
      }
      const channelsRes = await fetch(`${API_URL}/v1/integrations/channels`, {
        headers: headers(),
        credentials: 'include',
      });
      if (channelsRes.ok) {
        const channels = (await channelsRes.json()) as {
          mneMcpAvailable?: boolean;
          items: Array<{ sipConfigured?: boolean }>;
        };
        setSipConfigured(Boolean(channels.items[0]?.sipConfigured));
        setMneMcpAvailable(Boolean(channels.mneMcpAvailable));
      }
    })();
  }, [csrfToken, organizationId, api]);

  async function sendText(): Promise<void> {
    if (!agentId || !input.trim()) return;
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      ts: Date.now(),
    };
    dispatchTranscript({ type: 'message.add', message: userMsg });
    const sentInput = input.trim();
    setInput('');

    const response = await api.POST('/v1/responses', {
      headers: headers(),
      body: {
        agentId,
        input: sentInput,
        stream: false,
        mneMcpEnabled,
        ...(activeConversationId ? { conversationId: activeConversationId } : {}),
      },
    });
    if (response.error) {
      setError(errorMessage(response.error));
      return;
    }
    if (
      mneMcpEnabled &&
      response.data.mneMcp &&
      ['failed', 'unavailable'].includes(response.data.mneMcp.status)
    ) {
      setError('MNE-MCP trenutno nije dostupan; odgovor koristi lokalnu bazu znanja.');
    }
    dispatchTranscript({
      type: 'message.add',
      message: {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.data.text,
        ts: Date.now(),
      },
    });
    const returnedConvId = (response.data as unknown as { conversationId?: string }).conversationId;
    if (!activeConversationId && returnedConvId) {
      setActiveConversationId(returnedConvId);
      setConversations((prev) => [
        {
          id: returnedConvId,
          startedAt: new Date().toISOString(),
          preview: sentInput.slice(0, 40),
        },
        ...prev,
      ]);
    }
  }

  async function startVoice(): Promise<void> {
    if (!agentId) return;
    await roomRef.current?.disconnect();
    dispatchTranscript({ type: 'session.prepare' });
    setVoiceState('connecting');
    setError('');
    setAudioBlocked(false);
    sessionStartedRef.current = false;
    assistantAudioStartedRef.current = false;
    clearVoiceTimers();
    const response = await api.POST('/v1/agents/{agentId}/realtime-sessions', {
      params: { path: { agentId }, header: { 'Idempotency-Key': crypto.randomUUID() } },
      headers: { ...headers(), 'Idempotency-Key': crypto.randomUUID() },
      body: { participantName: 'Web korisnik', mneMcpEnabled },
    });
    if (!response.response.ok || !response.data) {
      setError(errorMessage(response.error));
      setVoiceState('error');
      return;
    }
    await connectRoom(response.data);
  }

  async function connectRoom(session: RealtimeSession): Promise<void> {
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.setAttribute('autoplay', 'true');
        el.setAttribute('data-testid', 'remote-audio-track');
        el.style.display = 'none';
        document.body.append(el);
        void el.play().catch(() => {
          setAudioBlocked(true);
          setError('Chrome je blokirao reprodukciju zvuka. Kliknite Omogući zvuk.');
        });
        setVoiceState('speaking');
        track.mediaStreamTrack.addEventListener('ended', () => {
          el.remove();
          setVoiceState('listening');
        });
      }
    });
    room.on(
      RoomEvent.DataReceived,
      (
        bytes: Uint8Array,
        _p: RemoteParticipant | undefined,
        _k: unknown,
        topic: string | undefined,
      ) => {
        if (topic !== 'montenegrina.events') return;
        let evt: { type: string; payload: Record<string, unknown> };
        try {
          evt = JSON.parse(new TextDecoder().decode(bytes)) as {
            type: string;
            payload: Record<string, unknown>;
          };
        } catch {
          setError('Received an invalid voice event from the agent.');
          return;
        }
        setEvents((current) =>
          [`${evt.type}: ${JSON.stringify(evt.payload)}`, ...current].slice(0, 40),
        );
        if (evt.type === 'session.started') {
          sessionStartedRef.current = true;
          if (voiceState !== 'speaking') setVoiceState('listening');
        } else if (evt.type === 'assistant.audio.started') {
          assistantAudioStartedRef.current = true;
          setVoiceState('speaking');
        } else if (evt.type === 'assistant.audio.completed') {
          setVoiceState('listening');
        } else if (evt.type === 'error') {
          const message =
            typeof evt.payload.message === 'string' ? evt.payload.message : 'Voice runtime failed.';
          setError(message);
          setVoiceState('error');
        }
        const handled = new Set([
          'session.started',
          'audio.started',
          'transcription.partial',
          'transcription.final',
          'user.turn.completed',
          'turn.started',
          'assistant.audio.started',
          'assistant.text.delta',
          'assistant.text.completed',
          'assistant.interrupted',
          'assistant.audio.completed',
          'error',
        ]);
        if (!handled.has(evt.type)) return;
        dispatchTranscript({ type: 'voice.event', event: evt });
      },
    );
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      setAudioBlocked(!room.canPlaybackAudio);
    });
    room.on(RoomEvent.TrackSubscriptionFailed, () => {
      setError(
        'Agent audio track could not be subscribed. Check LiveKit token and room permissions.',
      );
      setVoiceState('error');
    });
    room.on(RoomEvent.MediaDevicesError, () => {
      setError('Microphone access failed. Check browser microphone permissions.');
      setVoiceState('error');
    });
    room.on(RoomEvent.Disconnected, () => {
      clearVoiceTimers();
      setAudioBlocked(false);
      setVoiceState('idle');
    });
    try {
      await room.connect(session.livekitUrl, session.participantToken, { autoSubscribe: true });
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Voice connection failed.');
      setVoiceState('error');
      await room.disconnect();
      return;
    }
    await room.startAudio().then(
      () => setAudioBlocked(!room.canPlaybackAudio),
      () => {
        setAudioBlocked(true);
        setError('Chrome je blokirao reprodukciju zvuka. Kliknite Omogući zvuk.');
      },
    );
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (microphoneError) {
      setError(
        microphoneError instanceof Error ? microphoneError.message : 'Microphone access failed.',
      );
      setVoiceState('error');
      await room.disconnect();
      return;
    }
    roomRef.current = room;
    setVoiceState('listening');
    voiceTimersRef.current = [
      setTimeout(() => {
        if (!sessionStartedRef.current) {
          setError(
            'Voice agent did not join the LiveKit room. Check LiveKit URL, API credentials, and agent deployment.',
          );
          setVoiceState('error');
        }
      }, 15_000),
      setTimeout(() => {
        if (sessionStartedRef.current && !assistantAudioStartedRef.current) {
          setError(
            'Voice agent joined but did not start audio. Check voice-agent logs, OpenAI model, STT/VAD, and TTS configuration.',
          );
        }
      }, 30_000),
    ];
  }

  async function startPhoneCall(): Promise<void> {
    if (!agentId || !phoneTo.trim()) return;
    setPhoneCallState('dialing');
    setError('');
    const response = await api.POST('/v1/agents/{agentId}/calls', {
      params: { path: { agentId }, header: { 'Idempotency-Key': crypto.randomUUID() } },
      headers: { ...headers(), 'Idempotency-Key': crypto.randomUUID() },
      body: { to: phoneTo.trim() },
    });
    if (!response.response.ok || !response.data) {
      setError(errorMessage(response.error));
      setPhoneCallState('error');
      return;
    }
    const conversationId = response.data.id;
    setActiveConversationId(conversationId);
    for (let attempt = 0; attempt < 45; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const status = await api.GET('/v1/conversations/{conversationId}', {
        params: { path: { conversationId } },
        headers: headers(),
      });
      if (!status.response.ok || !status.data) continue;
      if (status.data.state === 'COMPLETED') {
        setPhoneCallState('done');
        return;
      }
      if (status.data.state === 'FAILED') {
        setError('Phone call failed.');
        setPhoneCallState('error');
        return;
      }
    }
    setPhoneCallState('done');
  }

  async function stopVoice(): Promise<void> {
    clearVoiceTimers();
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setAudioBlocked(false);
    setVoiceState('idle');
  }

  async function enableAudio(): Promise<void> {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      setAudioBlocked(!room.canPlaybackAudio);
      if (room.canPlaybackAudio) setError('');
    } catch {
      setAudioBlocked(true);
      setError(
        'Browser still blocks audio playback. Click the button again after interacting with the page.',
      );
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] min-h-0 bg-bg">
      <TopBar
        agents={agents}
        agentId={agentId}
        voiceState={voiceState}
        isDevOpen={isDevOpen}
        activeSection={activeSection}
        onAgentChange={setAgentId}
        onDevToggle={() => setIsDevOpen((open) => !open)}
        onSectionChange={setActiveSection}
      />
      {error && <p className="px-4 py-2 text-error text-sm">{error}</p>}
      {activeSection === 'knowledge' ? (
        <KnowledgeSection apiUrl={API_URL} headers={headers} agentId={agentId} />
      ) : (
        <>
          <ConversationArea
            messages={messages}
            voiceState={voiceState}
            agentId={agentId}
            audioBlocked={audioBlocked}
            onStartVoice={() => void startVoice()}
            onEnableAudio={() => void enableAudio()}
          />
          <Composer
            input={input}
            agentId={agentId}
            voiceState={voiceState}
            onInputChange={setInput}
            onSend={() => void sendText()}
            onStartVoice={() => void startVoice()}
            onStopVoice={() => void stopVoice()}
            mneMcpEnabled={mneMcpEnabled}
            mneMcpAvailable={mneMcpAvailable}
            mneMcpLocked={
              voiceState === 'connecting' || voiceState === 'listening' || voiceState === 'speaking'
            }
            onMneMcpChange={setMneMcpEnabled}
          />
          <div className="px-4 pb-4 border-t border-border pt-3">
            <p className="text-xs font-medium text-ink-2 mb-2">Test phone call</p>
            <div className="flex gap-2 items-center">
              <input
                className="input flex-1"
                placeholder="+38267123456"
                value={phoneTo}
                disabled={!sipConfigured}
                title={
                  sipConfigured
                    ? undefined
                    : 'Configure LIVEKIT_SIP_OUTBOUND_TRUNK_ID for outbound calls'
                }
                onChange={(event) => setPhoneTo(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={!sipConfigured || !agentId || phoneCallState === 'dialing'}
                onClick={() => void startPhoneCall()}
              >
                {phoneCallState === 'dialing'
                  ? 'Dialing…'
                  : phoneCallState === 'done'
                    ? 'Call started'
                    : phoneCallState === 'error'
                      ? 'Call failed'
                      : 'Call'}
              </button>
            </div>
          </div>
        </>
      )}
      {isDevOpen && <DevPanel events={events} onClose={() => setIsDevOpen(false)} />}
    </div>
  );
}
