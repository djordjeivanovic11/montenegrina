'use client';

import { useEffect, useRef } from 'react';

interface DevPanelProps {
  events: string[];
  onClose: () => void;
}

export function DevPanel({ events, onClose }: DevPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [events]);

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 flex flex-col animate-fade-in"
      style={{
        height: '40%',
        minHeight: 200,
        backgroundColor: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
      }}
      role="dialog"
      aria-label="Dev Panel — živi događaji"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--color-ink-2)' }}>
          Živi događaji
          {events.length > 0 && (
            <span
              className="ml-2 px-1.5 py-0.5 rounded text-xs"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                color: 'var(--color-ink-3)',
              }}
            >
              {events.length}
            </span>
          )}
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded transition-colors hover:text-ink cursor-pointer"
          style={{ color: 'var(--color-ink-3)' }}
          aria-label="Zatvori DevPanel"
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
              d="M2 2L12 12M12 2L2 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Events list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-2"
        style={{ fontFamily: 'var(--font-family-mono)' }}
      >
        {events.length === 0 ? (
          <p className="text-xs py-2" style={{ color: 'var(--color-ink-3)' }}>
            Nema događaja.
          </p>
        ) : (
          events.map((event, index) => (
            <div
              key={index}
              className="py-1.5 text-xs"
              style={{
                borderBottom: '1px solid var(--color-border)',
                color: 'var(--color-ink-2)',
              }}
            >
              <span style={{ color: 'var(--color-ink-3)' }} className="mr-2">
                {String(index + 1).padStart(2, '0')}
              </span>
              {event}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
