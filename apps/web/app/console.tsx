'use client';

import { createApiClient, type components } from '@montenegrina/sdk-typescript';
import { Room, RoomEvent, type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant } from 'livekit-client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

type Agent = components['schemas']['Agent'];
type RealtimeSession = components['schemas']['RealtimeSession'];
type ApiError = components['schemas']['ErrorEnvelope'];

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function message(error: unknown): string {
  if (error && typeof error === 'object' && 'error' in error) {
    return ((error as ApiError).error.message ?? 'API request failed');
  }
  return error instanceof Error ? error.message : 'Request failed';
}

export function Console() {
  const api = useMemo(() => createApiClient(apiUrl), []);
  const [email, setEmail] = useState('admin@montenegrina.local');
  const [password, setPassword] = useState('local-admin-change-me');
  const [csrf, setCsrf] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState('');
  const [input, setInput] = useState('Koje je vaše radno vrijeme?');
  const [answer, setAnswer] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [status, setStatus] = useState('Odjavljeno');
  const roomRef = useRef<Room | null>(null);

  const headers = (): Record<string, string> => ({
    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    ...(organizationId ? { 'X-Organization-Id': organizationId } : {}),
  });

  async function loadWorkspace(token: string): Promise<void> {
    const organizations = await api.GET('/v1/organizations');
    if (!organizations.response.ok || !organizations.data) throw new Error('Nije moguće učitati organizacije.');
    const organization = organizations.data.items[0];
    if (!organization) throw new Error('Korisnik nema organizaciju.');
    setOrganizationId(organization.id);
    const listed = await api.GET('/v1/agents', {
      headers: { 'X-Organization-Id': organization.id },
    });
    if (!listed.response.ok || !listed.data) throw new Error('Nije moguće učitati agente.');
    setAgents(listed.data.items);
    setAgentId(listed.data.items[0]?.id ?? '');
    setCsrf(token);
  }

  async function login(event: FormEvent): Promise<void> {
    event.preventDefault();
    setStatus('Prijava…');
    const response = await api.POST('/v1/auth/login', { body: { email, password } });
    if (response.error) { setStatus(message(response.error)); return; }
    try {
      await loadWorkspace(response.data.csrfToken);
      setStatus(`Prijavljeni: ${response.data.user.email}`);
    } catch (error) { setStatus(message(error)); }
  }

  async function sendText(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!agentId) return;
    setStatus('Generisanje odgovora…');
    const response = await api.POST('/v1/responses', {
      headers: headers(),
      body: { agentId, input, stream: false },
    });
    if (response.error) { setStatus(message(response.error)); return; }
    setAnswer(response.data.text);
    setStatus('Odgovor je spreman');
  }

  async function startVoice(): Promise<void> {
    if (!agentId) return;
    await roomRef.current?.disconnect();
    setStatus('Kreiranje glasovne sesije…');
    const response = await api.POST('/v1/agents/{agentId}/realtime-sessions', {
      params: { path: { agentId }, header: { 'Idempotency-Key': crypto.randomUUID() } },
      headers: { ...headers(), 'Idempotency-Key': crypto.randomUUID() },
      body: { participantName: 'Web korisnik' },
    });
    if (!response.response.ok || !response.data) { setStatus('Nije moguće kreirati glasovnu sesiju.'); return; }
    await connectRoom(response.data);
  }

  async function connectRoom(session: RealtimeSession): Promise<void> {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
      if (track.kind === 'audio') document.body.append(track.attach());
    });
    room.on(RoomEvent.DataReceived, (bytes, _participant, _kind, topic) => {
      if (topic !== 'montenegrina.events') return;
      const event = JSON.parse(new TextDecoder().decode(bytes)) as { type: string; payload: Record<string, unknown> };
      setEvents((current) => [`${event.type}: ${JSON.stringify(event.payload)}`, ...current].slice(0, 40));
    });
    room.on(RoomEvent.Disconnected, () => setStatus('Glasovna sesija završena'));
    await room.connect(session.livekitUrl, session.participantToken, { autoSubscribe: true });
    await room.localParticipant.setMicrophoneEnabled(true);
    roomRef.current = room;
    setStatus(`Glasovna sesija aktivna: ${session.conversationId}`);
  }

  useEffect(() => () => { void roomRef.current?.disconnect(); }, []);

  return (
    <main>
      <header><span className="mark">M</span><div><h1>Montenegrina</h1><p>Produkcijska kontrolna tabla i glasovni demo</p></div></header>
      <section className="status">{status}</section>
      <div className="grid">
        <section className="card">
          <h2>Prijava</h2>
          <form onSubmit={(event) => void login(event)}>
            <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" /></label>
            <label>Lozinka<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" /></label>
            <button type="submit">Prijavi se</button>
          </form>
        </section>
        <section className="card">
          <h2>Agent</h2>
          <label>Objavljeni agent<select value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">Izaberi</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
          <button className="voice" onClick={() => void startVoice()} disabled={!agentId}>Pokreni glasovni razgovor</button>
          <button className="secondary" onClick={() => void roomRef.current?.disconnect()} disabled={!roomRef.current}>Prekini</button>
        </section>
        <section className="card wide">
          <h2>Tekstualni odgovor</h2>
          <form onSubmit={(event) => void sendText(event)}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} rows={3} />
            <button disabled={!agentId}>Pošalji</button>
          </form>
          {answer && <div className="answer">{answer}</div>}
        </section>
        <section className="card wide events">
          <h2>Događaji uživo</h2>
          {events.length ? events.map((item, index) => <code key={`${index}-${item}`}>{item}</code>) : <p>Nema događaja.</p>}
        </section>
      </div>
    </main>
  );
}
