'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Card, PageHeader } from '../../components/ui/page-shell';
import { API_URL, api, apiHeaders } from '../../lib/api-client';
import { useI18n } from '../../lib/i18n/index';
import { useSession } from '../../lib/hooks/use-session';
import { useWorkspace } from '../../lib/hooks/use-workspace';

const STEPS = [
  'NAME_WORKSPACE',
  'CHOOSE_USE_CASE',
  'CREATE_AGENT',
  'CONFIGURE_AGENT',
  'ADD_KNOWLEDGE',
  'TEST_AGENT',
  'PUBLISH_AGENT',
] as const;

type Step = (typeof STEPS)[number];

const USE_CASES = [
  'CUSTOMER_SUPPORT',
  'GOVERNMENT',
  'MUNICIPALITY',
  'BANKING',
  'TELECOM',
  'TOURISM',
  'HEALTHCARE',
  'GENERAL',
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useI18n('cnr');
  const { refresh } = useSession();
  const { organization, organizationId } = useWorkspace();
  const [stepIndex, setStepIndex] = useState(0);
  const [workspaceName, setWorkspaceName] = useState('');
  const [useCase, setUseCase] = useState<(typeof USE_CASES)[number]>('GENERAL');
  const [agentName, setAgentName] = useState('My Agent');
  const [instructions, setInstructions] = useState('You are a helpful Montenegrina assistant.');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (organization?.name) setWorkspaceName(organization.name);
  }, [organization?.name]);

  const currentStep = STEPS[stepIndex] as Step;

  const patchOnboarding = useCallback(
    async (body: { currentStep?: Step | 'COMPLETED'; useCase?: string; complete?: boolean }) => {
      if (!organizationId) return;
      await fetch(`${API_URL}/v1/organizations/${organizationId}/onboarding`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
    [organizationId],
  );

  async function next() {
    setLoading(true);
    try {
      if (currentStep === 'NAME_WORKSPACE' && workspaceName) {
        await fetch(`${API_URL}/v1/organizations/${organizationId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: workspaceName }),
        });
        await patchOnboarding({ currentStep: 'CHOOSE_USE_CASE' });
      } else if (currentStep === 'CHOOSE_USE_CASE') {
        await patchOnboarding({ currentStep: 'CREATE_AGENT', useCase });
      } else if (currentStep === 'CREATE_AGENT') {
        await api.POST('/v1/agents', {
          params: { header: { 'Idempotency-Key': crypto.randomUUID() } },
          body: { name: agentName, slug: agentName.toLowerCase().replace(/\s+/g, '-') },
        });
        await patchOnboarding({ currentStep: 'CONFIGURE_AGENT' });
      } else if (currentStep === 'CONFIGURE_AGENT') {
        const agents = await api.GET('/v1/agents');
        const agentId = agents.data?.items[0]?.id;
        if (agentId) {
          await api.PATCH('/v1/agents/{agentId}', {
            params: { path: { agentId }, header: { 'Idempotency-Key': crypto.randomUUID() } },
            body: { description: instructions },
          });
        }
        await patchOnboarding({ currentStep: 'ADD_KNOWLEDGE' });
      } else if (currentStep === 'ADD_KNOWLEDGE') {
        await patchOnboarding({ currentStep: 'TEST_AGENT' });
      } else if (currentStep === 'TEST_AGENT') {
        await patchOnboarding({ currentStep: 'PUBLISH_AGENT' });
      } else if (currentStep === 'PUBLISH_AGENT') {
        await patchOnboarding({ complete: true, currentStep: 'COMPLETED' });
        await refresh();
        router.replace('/overview');
        return;
      }
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    } finally {
      setLoading(false);
    }
  }

  function back() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-bg">
      <div className="w-full max-w-lg">
        <PageHeader title={t('onboarding.title')} description={`Step ${stepIndex + 1} of ${STEPS.length}`} />
        <div className="flex gap-1 mt-4 mb-6">
          {STEPS.map((_, i) => (
            <div key={STEPS[i]} className={`onboarding-step ${i <= stepIndex ? 'onboarding-step-active' : ''}`} />
          ))}
        </div>
        <Card className="p-6">
          {currentStep === 'NAME_WORKSPACE' && (
            <label className="field-label">
              {t('onboarding.step1')}
              <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} className="input-field" />
            </label>
          )}
          {currentStep === 'CHOOSE_USE_CASE' && (
            <div>
              <p className="text-sm font-medium mb-3">{t('onboarding.step2')}</p>
              <div className="grid grid-cols-2 gap-2">
                {USE_CASES.map((uc) => (
                  <button key={uc} type="button" onClick={() => setUseCase(uc)} className={`btn-secondary text-xs ${useCase === uc ? 'ring-2 ring-accent' : ''}`}>
                    {uc.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}
          {currentStep === 'CREATE_AGENT' && (
            <label className="field-label">
              {t('onboarding.step3')}
              <input value={agentName} onChange={(e) => setAgentName(e.target.value)} className="input-field" />
            </label>
          )}
          {currentStep === 'CONFIGURE_AGENT' && (
            <label className="field-label">
              {t('onboarding.step4')}
              <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={5} className="input-field resize-none" />
            </label>
          )}
          {currentStep === 'ADD_KNOWLEDGE' && (
            <p className="text-sm text-ink-2">{t('onboarding.step5')} — upload documents later from the Knowledge page.</p>
          )}
          {currentStep === 'TEST_AGENT' && (
            <p className="text-sm text-ink-2">{t('onboarding.step6')} — use the Playground after setup to test voice and chat.</p>
          )}
          {currentStep === 'PUBLISH_AGENT' && (
            <p className="text-sm text-ink-2">{t('onboarding.step7')} — publish your agent to make it available.</p>
          )}
          <div className="flex gap-3 mt-6">
            {stepIndex > 0 && (
              <button type="button" onClick={back} className="btn-secondary flex-1" disabled={loading}>
                {t('app.back')}
              </button>
            )}
            <button type="button" onClick={() => void next()} className="btn-primary flex-1" disabled={loading}>
              {stepIndex === STEPS.length - 1 ? t('app.complete') : t('app.continue')}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
