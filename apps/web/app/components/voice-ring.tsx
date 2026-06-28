'use client';

type VoiceState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

interface VoiceRingProps {
  voiceState: VoiceState;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function VoiceRing({ voiceState, disabled = false, onStart, onStop }: VoiceRingProps) {
  const isActive = voiceState === 'listening' || voiceState === 'speaking' || voiceState === 'connecting';

  const handleClick = () => {
    if (isActive) {
      onStop();
    } else {
      onStart();
    }
  };

  return (
    <div className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
      {/* Pulse ring for listening state */}
      {voiceState === 'listening' && (
        <span
          className="absolute inset-0 rounded-full animate-pulse-ring"
          style={{ backgroundColor: 'var(--color-accent)', opacity: 0.35 }}
          aria-hidden="true"
        />
      )}

      {/* Breathe ring for speaking state */}
      {voiceState === 'speaking' && (
        <span
          className="absolute inset-0 rounded-full animate-breathe"
          style={{ backgroundColor: 'var(--color-accent)', opacity: 0.25 }}
          aria-hidden="true"
        />
      )}

      <button
        onClick={handleClick}
        disabled={disabled && !isActive}
        className="relative z-10 w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          backgroundColor: isActive ? 'var(--color-accent)' : 'var(--color-surface-2)',
          border: `1px solid ${isActive ? 'transparent' : 'var(--color-border)'}`,
          color: isActive ? 'var(--color-accent-fg)' : 'var(--color-ink-2)',
        }}
        aria-label={isActive ? 'Zaustavi glasovnu sesiju' : 'Pokreni glasovnu sesiju'}
      >
        {isActive ? (
          /* Stop icon */
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect
              x="4"
              y="4"
              width="10"
              height="10"
              rx="2"
              fill="currentColor"
            />
          </svg>
        ) : (
          /* Mic icon */
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect
              x="6"
              y="1"
              width="6"
              height="10"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M3 9C3 12.3137 5.68629 15 9 15C12.3137 15 15 12.3137 15 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1="9"
              y1="15"
              x2="9"
              y2="17"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
