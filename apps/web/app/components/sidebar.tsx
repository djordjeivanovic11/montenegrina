'use client';

export interface KnowledgeDoc {
  id: string;
  title: string;
  status: string;
}

interface SidebarProps {
  userEmail: string;
  avatarUrl: string | undefined;
  activeSection: 'chat' | 'knowledge';
  onSectionChange: (section: 'chat' | 'knowledge') => void;
  conversations: Array<{ id: string; startedAt: string; preview?: string }>;
  activeConversationId: string | undefined;
  onConversationSelect: ((id: string) => void) | undefined;
  onNewConversation: (() => void) | undefined;
}

export function Sidebar({
  userEmail,
  avatarUrl,
  activeSection,
  onSectionChange,
  conversations,
  activeConversationId,
  onConversationSelect,
  onNewConversation,
}: SidebarProps) {
  return (
    <aside
      className="flex flex-col h-full w-60 shrink-0"
      style={{
        backgroundColor: 'var(--color-surface-2)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* Logo */}
      <div className="px-4 py-4 flex items-center gap-2.5">
        <div className="w-7 h-7 flex items-center justify-center shrink-0">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="28" height="28" rx="7" fill="var(--color-accent)" />
            <rect x="6" y="11" width="3" height="6" rx="1.5" fill="white" />
            <rect x="11" y="8" width="3" height="12" rx="1.5" fill="white" />
            <rect x="16" y="5" width="3" height="18" rx="1.5" fill="white" />
            <rect x="21" y="9" width="3" height="10" rx="1.5" fill="white" />
          </svg>
        </div>
        <span className="text-ink font-semibold text-sm">Montenegrina</span>
      </div>

      {/* Navigation */}
      <div className="px-3 mb-4 space-y-1">
        <button
          type="button"
          className="w-full text-left px-3 py-2 rounded-lg text-sm cursor-pointer"
          style={{
            backgroundColor: activeSection === 'chat' ? 'var(--color-border)' : 'transparent',
            color: 'var(--color-ink)',
          }}
          onClick={() => onSectionChange('chat')}
        >
          Razgovor
        </button>
        <button
          type="button"
          className="w-full text-left px-3 py-2 rounded-lg text-sm cursor-pointer"
          style={{
            backgroundColor: activeSection === 'knowledge' ? 'var(--color-border)' : 'transparent',
            color: 'var(--color-ink)',
          }}
          onClick={() => onSectionChange('knowledge')}
        >
          Znanje
        </button>
      </div>

      {/* New conversation button */}
      <div className="px-3 mb-4">
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-ink-2 text-sm transition-colors hover:text-ink cursor-pointer"
          style={{ border: '1px solid var(--color-border)' }}
          aria-label="Nova razgovor"
          onClick={() => onNewConversation?.()}
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
              d="M7 1V13M1 7H13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Nova razgovor
        </button>
      </div>

      {/* Conversation history */}
      <div className="flex-1 overflow-y-auto px-3">
        <p
          className="text-xs font-medium uppercase tracking-wide mb-2 px-1"
          style={{ color: 'var(--color-ink-3)' }}
        >
          Razgovori
        </p>
        {conversations && conversations.length > 0 ? (
          <ul className="space-y-0.5">
            {conversations.map(conv => (
              <li key={conv.id}>
                <button
                  type="button"
                  onClick={() => onConversationSelect?.(conv.id)}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-xs truncate transition-colors cursor-pointer"
                  style={{
                    backgroundColor: activeConversationId === conv.id ? 'var(--color-border)' : 'transparent',
                    color: 'var(--color-ink-2)',
                  }}
                >
                  {conv.preview ?? new Date(conv.startedAt).toLocaleDateString('sr', { month: 'short', day: 'numeric' })}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs px-1" style={{ color: 'var(--color-ink-3)' }}>Nema razgovora</p>
        )}
      </div>

      {/* Account area */}
      {userEmail && (
        <div
          className="px-3 py-3 flex items-center gap-2.5"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={userEmail}
              className="w-7 h-7 rounded-full shrink-0 object-cover"
            />
          ) : (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                color: 'var(--color-ink-2)',
              }}
            >
              {userEmail[0]?.toUpperCase() ?? 'U'}
            </div>
          )}
          <span
            className="text-xs truncate flex-1"
            style={{ color: 'var(--color-ink-2)' }}
            title={userEmail}
          >
            {userEmail}
          </span>
          <button
            type="button"
            className="shrink-0 p-1 rounded transition-colors hover:text-ink cursor-pointer"
            style={{ color: 'var(--color-ink-3)' }}
            aria-label="Podešavanja"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M7 1.5V2.5M7 11.5V12.5M1.5 7H2.5M11.5 7H12.5M3.22 3.22L3.93 3.93M10.07 10.07L10.78 10.78M10.78 3.22L10.07 3.93M3.93 10.07L3.22 10.78"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
    </aside>
  );
}
