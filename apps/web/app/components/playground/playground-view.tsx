'use client';

import { createApiClient, type components } from '@montenegrina/sdk-typescript';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteParticipant,
} from 'livekit-client';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Composer } from '../composer';
import { ConversationArea, type Message } from '../conversation-area';
import { DevPanel } from '../dev-panel';
import { KnowledgeSection } from '../knowledge/knowledge-section';
import { TopBar } from '../top-bar';
import { API_URL, apiHeaders, errorMessage } from '../../lib/api-client';
import { useSession } from '../../lib/hooks/use-session';
import { useWorkspace } from '../../lib/hooks/use-workspace';

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [isDevOpen, setIsDevOpen] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<'chat' | 'knowledge'>('chat');
  const [phoneTo, setPhoneTo] = useState('');
  const [phoneCallState, setPhoneCallState] = useState<'idle' | 'dialing' | 'done' | 'error'>('idle');
  const [sipConfigured, setSipConfigured] = useState(false);
  const [conversations, setConversations] = useState<Array<{ id: string; startedAt: string; preview?: string }>>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();

  const roomRef = useRef<Room | null>(null);
  const api = useMemo(() => createApiClient(API_URL), []);

  useEffect(() => () => { void roomRef.current?.disconnect(); }, []);

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
        const convData = (await convResponse.json()) as { items: Array<{ id: string; startedAt: string; preview?: string }> };
        setConversations(convData.items ?? []);
      }
      const channelsRes = await fetch(`${API_URL}/v1/integrations/channels`, {
        headers: headers(),
        credentials: 'include',
      });
      if (channelsRes.ok) {
        const channels = (await channelsRes.json()) as { items: Array<{ sipConfigured?: boolean }> };
        setSipConfigured(Boolean(channels.items[0]?.sipConfigured));
      }
    })();
  }, [csrfToken, organizationId, api]);

  async function sendText(): Promise<void> {
    if (!agentId || !input.trim()) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: input.trim(), ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    const sentInput = input.trim();
    setInput('');

    const response = await api.POST('/v1/responses', {
      headers: headers(),
      body: { agentId, input: sentInput, stream: false, ...(activeConversationId ? { conversationId: activeConversationId } : {}) },
    });
    if (response.error) {
      setError(errorMessage(response.error));
      return;
    }
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: response.data.text, ts: Date.now() }]);
    const returnedConvId = (response.data as unknown as { conversationId?: string }).conversationId;
    if (!activeConversationId && returnedConvId) {
      setActiveConversationId(returnedConvId);
      setConversations((prev) => [{ id: returnedConvId, startedAt: new Date().toISOString(), preview: sentInput.slice(0, 40) }, ...prev]);
    }
  }

    async function startVoice(): Promise<void> {
    if (!agentId) return;
    await roomRef.current?.disconnect();
    setVoiceState('connecting');
    setError('');
    const response = await api.POST('/v1/agents/{agentId}/realtime-sessions', {
      params: { path: { agentId }, header: { 'Idempotency-Key': crypto.randomUUID() } },
      headers: { ...headers(), 'Idempotency-Key': crypto.randomUUID() },
      body: { participantName: 'Web korisnik' },
    });
    if (!response.response.ok || !response.data) {
      setError('The agent has no published version. Finish onboarding or publish the agent first.');
      setVoiceState('error');
      return;
    }
    await connectRoom(response.data);
  }

  async function connectRoom(session: RealtimeSession): Promise<void> {
    const room = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.setAttribute('autoplay', 'true');
        el.style.display = 'none';
        document.body.append(el);
        void el.play().catch(() => undefined);
        setVoiceState('speaking');
        track.mediaStreamTrack.addEventListener('ended', () => {
          el.remove();
          setVoiceState('listening');
        });
      }
    });
    room.on(RoomEvent.DataReceived, (bytes: Uint8Array, _p: RemoteParticipant | undefined, _k: unknown, topic: string | undefined) => {
      if (topic !== 'montenegrina.events') return;
      const evt = JSON.parse(new TextDecoder().decode(bytes)) as { type: string; payload: Record<string, unknown> };
      setEvents((current) => [`${evt.type}: ${JSON.stringify(evt.payload)}`, ...current].slice(0, 40));
      if (evt.type === 'transcription.final') {
        const content = typeof evt.payload.text === 'string' ? evt.payload.text : null;
        if (content) setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content, ts: Date.now() }]);
      } else if (evt.type === 'assistant.text.completed') {
        const content = typeof evt.payload.text === 'string' ? evt.payload.text : null;
        if (content) setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content, ts: Date.now() }]);
      }
    });
    room.on(RoomEvent.Disconnected, () => setVoiceState('idle'));
    await room.connect(session.livekitUrl, session.participantToken, { autoSubscribe: true });
    await room.localParticipant.setMicrophoneEnabled(true);
    roomRef.current = room;
    setVoiceState('listening');
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
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setVoiceState('idle');
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
          <ConversationArea messages={messages} voiceState={voiceState} agentId={agentId} onStartVoice={() => void startVoice()} />
          <Composer
            input={input}
            agentId={agentId}
            voiceState={voiceState}
            onInputChange={setInput}
            onSend={() => void sendText()}
            onStartVoice={() => void startVoice()}
            onStopVoice={() => void stopVoice()}
          />
          <div className="px-4 pb-4 border-t border-border pt-3">
            <p className="text-xs font-medium text-ink-2 mb-2">Test phone call</p>
            <div className="flex gap-2 items-center">
              <input
                className="input flex-1"
                placeholder="+38267123456"
                value={phoneTo}
                disabled={!sipConfigured}
                title={sipConfigured ? undefined : 'Configure LIVEKIT_SIP_OUTBOUND_TRUNK_ID for outbound calls'}
                onChange={(event) => setPhoneTo(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={!sipConfigured || !agentId || phoneCallState === 'dialing'}
                onClick={() => void startPhoneCall()}
              >
                {phoneCallState === 'dialing' ? 'Dialing…' : phoneCallState === 'done' ? 'Call started' : phoneCallState === 'error' ? 'Call failed' : 'Call'}
              </button>
            </div>
          </div>
        </>
      )}
      {isDevOpen && <DevPanel events={events} onClose={() => setIsDevOpen(false)} />}
    </div>
  );
}
