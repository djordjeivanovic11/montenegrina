'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { Badge, Card, PageHeader } from '../../components/ui/page-shell';
import { API_URL, apiHeaders, parseApiError, quotaErrorKey } from '../../lib/api-client';
import { useI18n } from '../../lib/i18n/index';

type Member = {
  userId: string;
  email?: string;
  displayName?: string;
  role: string;
  joinedAt: string;
};
type Invitation = { id: string; email: string; role: string; status: string };

export default function TeamPage() {
  const { t } = useI18n('cnr');
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'DEVELOPER' | 'VIEWER'>('DEVELOPER');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inviteLink, setInviteLink] = useState('');

  async function load() {
    const headers = apiHeaders();
    const [membersRes, invRes] = await Promise.all([
      fetch(`${API_URL}/v1/team/members`, { credentials: 'include', headers }),
      fetch(`${API_URL}/v1/team/invitations`, { credentials: 'include', headers }),
    ]);
    if (membersRes.ok) {
      const data = (await membersRes.json()) as { items: Member[] };
      setMembers(data.items);
    }
    if (invRes.ok) {
      const data = (await invRes.json()) as { items: Invitation[] };
      setInvitations(data.items);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setInviteLink('');
    const res = await fetch(`${API_URL}/v1/team/invitations`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    });
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      const parsed = parseApiError(body);
      if (parsed.code === 'QUOTA_EXCEEDED' && parsed.details) {
        setError(
          t('quota.exceeded', {
            metric: t(quotaErrorKey(parsed.details.metric)),
            current: String(parsed.details.current),
            limit: String(parsed.details.limit),
          }),
        );
      } else {
        setError(parsed.message || t('team.quotaExceeded'));
      }
      return;
    }
    const invitation = (await res.json()) as { token: string };
    setEmail('');
    setSuccess(t('team.inviteCreated'));
    setInviteLink(`${window.location.origin}/invite/accept?token=${invitation.token}`);
    await load();
  }

  return (
    <div className="page-content">
      <PageHeader title={t('team.title')} />
      <Card className="p-5 mt-6">
        <h2 className="text-sm font-semibold mb-4">{t('team.invite')}</h2>
        <form onSubmit={(e) => void invite(e)} className="flex flex-wrap gap-3 items-end">
          <label className="field-label flex-1 min-w-[200px]">
            {t('team.email')}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-field"
            />
          </label>
          <label className="field-label">
            {t('team.role')}
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="input-field"
            >
              <option value="ADMIN">Admin</option>
              <option value="DEVELOPER">Developer</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </label>
          <button type="submit" className="btn-primary">
            {t('team.sendInvite')}
          </button>
        </form>
        {error && <p className="text-error text-sm mt-2">{error}</p>}
        {success && <p className="text-sm text-ink-2 mt-2">{success}</p>}
        {inviteLink && (
          <div className="mt-3 flex gap-2">
            <input className="input-field flex-1" readOnly value={inviteLink} />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void navigator.clipboard.writeText(inviteLink)}
            >
              {t('team.copyInvite')}
            </button>
          </div>
        )}
      </Card>

      <h2 className="text-sm font-semibold mt-8 mb-3">{t('team.members')}</h2>
      <div className="grid gap-2">
        {members.map((m) => (
          <Card key={m.userId} className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{m.displayName ?? m.email}</p>
              <p className="text-xs text-ink-3">{m.email}</p>
            </div>
            <Badge>{m.role}</Badge>
          </Card>
        ))}
      </div>

      {invitations.length > 0 && (
        <>
          <h2 className="text-sm font-semibold mt-8 mb-3">Pending invitations</h2>
          <div className="grid gap-2">
            {invitations
              .filter((i) => i.status === 'PENDING')
              .map((inv) => (
                <Card key={inv.id} className="p-4 flex items-center justify-between">
                  <span className="text-sm">{inv.email}</span>
                  <Badge variant="muted">{inv.role}</Badge>
                </Card>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
