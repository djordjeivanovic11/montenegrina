'use client';

import { useEffect, useRef } from 'react';

import { MarkdownContent } from './markdown-content';

type VoiceState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  streaming?: boolean;
}

interface ConversationAreaProps {
  messages: Message[];
  voiceState: VoiceState;
  agentId: string;
  onStartVoice: () => void;
  audioBlocked?: boolean;
  onEnableAudio?: () => void;
}

function formatTime(ts: number): string {
  return new Intl.DateTimeFormat('sr-ME', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

export function ConversationArea({
  messages,
  voiceState,
  agentId,
  onStartVoice,
  audioBlocked = false,
  onEnableAudio,
}: ConversationAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const isVoiceActive =
    voiceState === 'listening' || voiceState === 'speaking' || voiceState === 'connecting';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex-1 overflow-y-auto relative">
      {/* Voice active indicator */}
      {isVoiceActive && (
        <div
          className="sticky top-0 z-10 flex items-center justify-center gap-2 py-2 text-xs font-medium"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
            color: 'var(--color-accent)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full bg-accent"
            aria-hidden="true"
          />
          {voiceState === 'connecting'
            ? 'Spajanje…'
            : voiceState === 'speaking'
              ? 'Agent govori'
              : 'Glasovna sesija aktivna — slušam'}
          {audioBlocked && onEnableAudio && (
            <button
              type="button"
              onClick={onEnableAudio}
              className="ml-2 px-2 py-1 rounded-md text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-fg)',
              }}
            >
              Omogući zvuk
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && !isVoiceActive && (
        <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
          <p
            className="text-2xl font-semibold"
            style={{ color: 'var(--color-ink)' }}
          >
            Razgovarajte sa Montenegrinom
          </p>
          <p className="text-sm" style={{ color: 'var(--color-ink-3)' }}>
            Koristite tekst ili glas za početak razgovora.
          </p>
          {agentId && (
            <button
              onClick={onStartVoice}
              className="mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90 cursor-pointer"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-fg)',
              }}
              aria-label="Pokreni glasovnu sesiju"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <rect x="5" y="1" width="6" height="8" rx="3" fill="currentColor" />
                <path
                  d="M2 8C2 11.3137 4.68629 14 8 14C11.3137 14 14 11.3137 14 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="8"
                  y1="14"
                  x2="8"
                  y2="15.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              Pokreni glas
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      {!isEmpty && (
        <div className="flex flex-col gap-4 px-6 py-6">
          {messages.filter((msg) => msg.content.trim() || msg.streaming).map((msg) => (
            <div
              key={msg.id}
              data-testid={`message-${msg.role}`}
              className={`flex flex-col gap-1 animate-fade-in max-w-[72%] ${
                msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--color-ink-3)' }}
                >
                  {msg.role === 'user' ? 'Vi' : 'Agent'}
                </span>
                <span
                  className="text-xs"
                  style={{ color: 'var(--color-ink-3)' }}
                >
                  {formatTime(msg.ts)}
                </span>
                {msg.streaming && (
                  <span className="text-xs text-accent animate-pulse">…</span>
                )}
              </div>
              <div
                data-testid={`message-${msg.role}-content`}
                className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
                style={{
                  backgroundColor:
                    msg.role === 'user'
                      ? 'var(--color-surface-2)'
                      : 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-ink)',
                  opacity: msg.streaming ? 0.92 : 1,
                }}
              >
                {msg.role === 'assistant' ? (
                  <MarkdownContent content={msg.content} />
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
