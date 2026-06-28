'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useI18n } from '../lib/i18n/index';
import { useSession } from '../lib/hooks/use-session';
import { useWorkspace } from '../lib/hooks/use-workspace';

const NAV_ITEMS = [
  { href: '/overview', key: 'nav.overview' },
  { href: '/agents', key: 'nav.agents' },
  { href: '/knowledge', key: 'nav.knowledge' },
  { href: '/conversations', key: 'nav.conversations' },
  { href: '/integrations', key: 'nav.integrations' },
  { href: '/usage', key: 'nav.usage' },
  { href: '/team', key: 'nav.team' },
  { href: '/billing', key: 'nav.billing' },
  { href: '/settings', key: 'nav.settings' },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const { t } = useI18n('cnr');
  const { user, logout, organizations } = useSession();
  const { organization, setOrganizationId } = useWorkspace();

  return (
    <aside className="app-sidebar">
      <div className="px-4 py-5 flex items-center gap-2.5">
        <LogoMark />
        <span className="text-sm font-semibold text-ink">Montenegrina</span>
      </div>

      {organizations.length > 1 && (
        <div className="px-3 mb-3">
          <select
            value={organization?.id ?? ''}
            onChange={(e) => setOrganizationId(e.target.value)}
            className="input-field text-xs w-full"
            aria-label="Workspace"
          >
            {organizations.map((org: { id: string; name: string }) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${active ? 'nav-link-active' : ''}`}
            >
              {t(item.key)}
            </Link>
          );
        })}
        <Link
          href="/playground"
          className={`nav-link mt-2 ${pathname === '/playground' ? 'nav-link-active' : ''}`}
        >
          {t('nav.playground')}
        </Link>
      </nav>

      {user && (
        <div className="px-3 py-3 border-t border-border flex items-center gap-2.5">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
          ) : (
            <div className="avatar-fallback">{user.email[0]?.toUpperCase() ?? 'U'}</div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-ink truncate">{user.displayName || user.email}</p>
            <p className="text-[11px] text-ink-3 truncate">{organization?.name}</p>
          </div>
          <button type="button" onClick={() => void logout()} className="btn-ghost p-1.5" aria-label={t('app.logout')}>
            <LogoutIcon />
          </button>
        </div>
      )}
    </aside>
  );
}

export function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="var(--color-accent)" />
      <rect x="6" y="11" width="3" height="6" rx="1.5" fill="var(--color-gold)" />
      <rect x="11" y="8" width="3" height="12" rx="1.5" fill="var(--color-gold)" />
      <rect x="16" y="5" width="3" height="18" rx="1.5" fill="var(--color-gold)" />
      <rect x="21" y="9" width="3" height="10" rx="1.5" fill="var(--color-gold)" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h2M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
