import type { components } from '@montenegrina/sdk-typescript';

import { API_URL, api, apiHeaders } from './api-client';
import { buildOnboardingAgentConfig } from './onboarding-agent-config';

type AgentConfiguration = components['schemas']['AgentConfiguration'];

export type AgentRecord = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  publishedVersionId?: string | null;
  archivedAt?: string | null;
  config?: AgentConfiguration;
};

export function slugifyAgentName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return base.length >= 2 ? base : 'agent';
}

export function uniqueAgentSlug(name: string): string {
  return `${slugifyAgentName(name)}-${crypto.randomUUID().slice(0, 6)}`;
}

export async function fetchKnowledgeBaseIds(): Promise<string[]> {
  const basesRes = await fetch(`${API_URL}/v1/knowledge/bases`, { credentials: 'include', headers: apiHeaders() });
  if (!basesRes.ok) return [];
  const data = (await basesRes.json()) as { items: Array<{ id: string }> };
  return data.items[0]?.id ? [data.items[0].id] : [];
}

export async function publishAgentVersion(
  agentId: string,
  systemPrompt: string,
  existingConfig?: AgentConfiguration | null,
): Promise<{ ok: boolean; message?: string }> {
  const knowledgeBaseIds = existingConfig?.knowledgeBaseIds?.length
    ? existingConfig.knowledgeBaseIds
    : await fetchKnowledgeBaseIds();
  const baseConfig = existingConfig ?? buildOnboardingAgentConfig(systemPrompt, knowledgeBaseIds);
  const config: AgentConfiguration = {
    ...baseConfig,
    systemPrompt,
    knowledgeBaseIds,
  };
  const version = await api.POST('/v1/agents/{agentId}/versions', {
    params: { path: { agentId }, header: { 'Idempotency-Key': crypto.randomUUID() } },
    body: { config },
  });
  if (!version.response.ok || !version.data) {
    return { ok: false, message: 'Failed to create agent version.' };
  }
  const published = await api.POST('/v1/agents/{agentId}/publish', {
    params: { path: { agentId }, header: { 'Idempotency-Key': crypto.randomUUID() } },
    body: { versionId: version.data.id },
  });
  if (!published.response.ok) {
    return { ok: false, message: 'Failed to publish agent.' };
  }
  return { ok: true };
}

export async function archiveAgent(agentId: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/v1/agents/${agentId}/archive`, {
    method: 'POST',
    credentials: 'include',
    headers: apiHeaders(),
  });
  return res.ok;
}
