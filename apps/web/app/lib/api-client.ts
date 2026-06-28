import { createApiClient } from '@montenegrina/sdk-typescript';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type ApiContext = {
  csrfToken: string;
  organizationId: string;
};

let context: ApiContext = { csrfToken: '', organizationId: '' };

export function setApiClientContext(partial: Partial<ApiContext>): void {
  context = { ...context, ...partial };
}

export function getApiContext(): ApiContext {
  return context;
}

export function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    ...(context.csrfToken ? { 'X-CSRF-Token': context.csrfToken } : {}),
    ...(context.organizationId ? { 'X-Organization-Id': context.organizationId } : {}),
    ...extra,
  };
}

export const api = createApiClient(API_URL);

api.use({
  onRequest({ request }: { request: Request }) {
    if (context.csrfToken) request.headers.set('X-CSRF-Token', context.csrfToken);
    if (context.organizationId) request.headers.set('X-Organization-Id', context.organizationId);
    return request;
  },
});

export function getApiClient() {
  return api;
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'error' in error) {
    const envelope = error as { error?: { message?: string } };
    return envelope.error?.message ?? 'Request failed';
  }
  return error instanceof Error ? error.message : 'Request failed';
}

export type QuotaErrorDetails = {
  metric: string;
  limit: number;
  current: number;
};

export function parseApiError(error: unknown): {
  code?: string;
  message: string;
  details?: QuotaErrorDetails;
} {
  if (error && typeof error === 'object' && 'error' in error) {
    const envelope = error as {
      error?: { code?: string; message?: string; details?: QuotaErrorDetails };
    };
    return {
      ...(envelope.error?.code ? { code: envelope.error.code } : {}),
      message: envelope.error?.message ?? 'Request failed',
      ...(envelope.error?.details ? { details: envelope.error.details } : {}),
    };
  }
  return { message: error instanceof Error ? error.message : 'Request failed' };
}

export function quotaErrorKey(metric: string): string {
  const normalized = metric.toLowerCase();
  if (normalized === 'agents') return 'quota.agents';
  if (normalized === 'documents') return 'quota.documents';
  if (normalized === 'team_members') return 'quota.team_members';
  if (normalized === 'voice_minutes') return 'quota.voice_minutes';
  return 'quota.exceeded';
}
