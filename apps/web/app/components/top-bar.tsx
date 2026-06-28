'use client';

import type { components } from '@montenegrina/sdk-typescript';

type Agent = components['schemas']['Agent'];

type VoiceState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

interface TopBarProps {
  agents: Agent[];
  agentId: string;
  voiceState: VoiceState;
  isDevOpen: boolean;
  activeSection: 'chat' | 'knowledge';
  onAgentChange: (id: string) => void;
  onDevToggle: () => void;
  onSectionChange: (section: 'chat' | 'knowledge') => void;
}

function statusLabel(voiceState: VoiceState): string {
  switch (voiceState) {
    case 'idle':
      return 'Nepovezano';
    case 'connecting':
      return 'Spajanje…';
    case 'listening':
      return 'Slušanje';
    case 'speaking':
      return 'Razgovaranje';
    case 'error':
      return 'Greška';
  }
}

function statusDotClass(voiceState: VoiceState): string {
  switch (voiceState) {
    case 'idle':
      return 'bg-ink-3';
    case 'connecting':
      return 'bg-accent animate-pulse';
    case 'listening':
    case 'speaking':
      return 'bg-accent';
    case 'error':
      return 'bg-error';
  }
}

export function TopBar({
  agents,
  agentId,
  voiceState,
  isDevOpen,
  activeSection,
  onAgentChange,
  onDevToggle,
  onSectionChange,
}: TopBarProps) {
  return (
    <header
      className="h-12 flex items-center justify-between px-4 shrink-0"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      {/* Agent selector */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSectionChange('chat')}
          className="px-2.5 py-1 rounded-md text-xs cursor-pointer"
          style={{
            backgroundColor: activeSection === 'chat' ? 'var(--color-surface-2)' : 'transparent',
            color: 'var(--color-ink-2)',
          }}
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => onSectionChange('knowledge')}
          className="px-2.5 py-1 rounded-md text-xs cursor-pointer"
          style={{
            backgroundColor: activeSection === 'knowledge' ? 'var(--color-surface-2)' : 'transparent',
            color: 'var(--color-ink-2)',
          }}
        >
          Znanje
        </button>
        <label htmlFor="agent-select" className="text-ink-3 text-xs sr-only">
          Agent
        </label>
        <div className="relative">
          <select
            id="agent-select"
            value={agentId}
            onChange={(e) => onAgentChange(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 rounded-lg text-sm outline-none cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              color: agentId ? 'var(--color-ink)' : 'var(--color-ink-3)',
            }}
            aria-label="Izaberite agenta"
          >
            <option value="">Izaberite agenta</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          <div
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2 3.5L5 6.5L8 3.5"
                stroke="var(--color-ink-3)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Right side: status + dev */}
      <div className="flex items-center gap-3">
        {/* Connection status badge */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass(voiceState)}`}
            aria-hidden="true"
          />
          <span className="text-ink-2 text-xs">{statusLabel(voiceState)}</span>
        </div>

        {/* Dev toggle */}
        <button
          onClick={onDevToggle}
          className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer"
          style={{
            backgroundColor: isDevOpen ? 'var(--color-accent)' : 'var(--color-surface-2)',
            color: isDevOpen ? 'var(--color-accent-fg)' : 'var(--color-ink-2)',
            border: `1px solid ${isDevOpen ? 'transparent' : 'var(--color-border)'}`,
          }}
          aria-label="Otvori DevPanel"
          aria-pressed={isDevOpen}
        >
          Dev
        </button>
      </div>
    </header>
  );
}
