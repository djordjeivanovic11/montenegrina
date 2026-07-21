'use client';

import { type KeyboardEvent } from 'react';
import { VoiceRing } from './voice-ring';

type VoiceState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

interface ComposerProps {
  input: string;
  agentId: string;
  voiceState: VoiceState;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStartVoice: () => void;
  onStopVoice: () => void;
  mneMcpEnabled: boolean;
  mneMcpAvailable: boolean;
  mneMcpLocked: boolean;
  onMneMcpChange: (enabled: boolean) => void;
}

export function Composer({
  input,
  agentId,
  voiceState,
  onInputChange,
  onSend,
  onStartVoice,
  onStopVoice,
  mneMcpEnabled,
  mneMcpAvailable,
  mneMcpLocked,
  onMneMcpChange,
}: ComposerProps) {
  const canSend = input.trim().length > 0 && agentId !== '';

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) {
        onSend();
      }
    }
  };

  return (
    <div className="shrink-0 px-4 py-3" style={{ borderTop: '1px solid var(--color-border)' }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
        className="flex items-end gap-3 rounded-2xl px-4 py-3"
        style={{
          backgroundColor: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
        }}
      >
        <button
          type="button"
          aria-pressed={mneMcpEnabled}
          aria-label="Uključi MNE-MCP izvore"
          title={
            !mneMcpAvailable
              ? 'MNE-MCP trenutno nije dostupan'
              : mneMcpLocked
                ? 'Izbor je zaključan dok je glasovna sesija aktivna'
                : 'Uključi šire crnogorske pravne i javne izvore'
          }
          disabled={!mneMcpAvailable || mneMcpLocked}
          onClick={() => onMneMcpChange(!mneMcpEnabled)}
          className="shrink-0 h-8 rounded-lg px-2.5 text-[11px] font-semibold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          style={{
            backgroundColor: mneMcpEnabled ? 'var(--color-accent)' : 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: mneMcpEnabled ? 'var(--color-accent-fg)' : 'var(--color-ink-2)',
          }}
        >
          MNE-MCP
        </button>

        {/* Text input */}
        <textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Upišite poruku…"
          rows={1}
          className="flex-1 resize-none bg-transparent outline-none text-sm leading-relaxed"
          style={{
            color: 'var(--color-ink)',
            maxHeight: 160,
            minHeight: 24,
            overflowY: 'auto',
          }}
          aria-label="Unesite poruku"
        />

        {/* Send button */}
        <button
          type="submit"
          disabled={!canSend}
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          style={{
            backgroundColor: canSend ? 'var(--color-accent)' : 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: canSend ? 'var(--color-accent-fg)' : 'var(--color-ink-3)',
          }}
          aria-label="Pošalji poruku"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M7 12V2M7 2L2.5 6.5M7 2L11.5 6.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Mic / Voice ring */}
        <div className="shrink-0 self-center">
          <VoiceRing
            voiceState={voiceState}
            disabled={!agentId}
            onStart={onStartVoice}
            onStop={onStopVoice}
          />
        </div>
      </form>

      <p className="text-center text-xs mt-2" style={{ color: 'var(--color-ink-3)' }}>
        Enter za slanje · Shift+Enter za novi red
      </p>
    </div>
  );
}
