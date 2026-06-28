'use client';

import { useEffect, useState } from 'react';

import { Card, PageHeader } from '../../components/ui/page-shell';
import { API_URL, apiHeaders } from '../../lib/api-client';
import { useI18n } from '../../lib/i18n/index';
import { useSession } from '../../lib/hooks/use-session';
import { useWorkspace } from '../../lib/hooks/use-workspace';

export default function SettingsPage() {
  const { t } = useI18n('cnr');
  const { user, logout } = useSession();
  const { organization } = useWorkspace();
  const [workspaceName, setWorkspaceName] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (organization?.name) setWorkspaceName(organization.name);
  }, [organization?.name]);

  async function saveWorkspace() {
    if (!organization) return;
    await fetch(`${API_URL}/v1/organizations/${organization?.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: workspaceName }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="page-content">
      <PageHeader title={t('settings.title')} />
      <Card className="p-5 mt-6">
        <h2 className="text-sm font-semibold mb-4">{t('settings.profile')}</h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-ink-3">Email</dt>
            <dd className="text-ink mt-0.5">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Name</dt>
            <dd className="text-ink mt-0.5">{user?.displayName}</dd>
          </div>
        </dl>
        <button type="button" onClick={() => void logout()} className="btn-secondary mt-6 text-sm">
          {t('app.logout')}
        </button>
      </Card>

      <Card className="p-5 mt-4">
        <h2 className="text-sm font-semibold mb-4">{t('settings.workspace')}</h2>
        <label className="field-label">
          Workspace name
          <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} className="input-field" />
        </label>
        <button type="button" onClick={() => void saveWorkspace()} className="btn-primary mt-4 text-sm">
          {t('app.save')}
        </button>
        {saved && <p className="text-sm text-ink-2 mt-2">Saved</p>}
      </Card>
    </div>
  );
}
