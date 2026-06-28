import { ProviderError, type ProviderRequestContext } from '@montenegrina/provider-core';

export function providerAbortSignal(context: ProviderRequestContext): AbortSignal {
  return AbortSignal.any(
    [context.signal, AbortSignal.timeout(context.timeoutMs)].filter(
      (signal): signal is AbortSignal => signal !== undefined,
    ),
  );
}

export async function checkedProviderFetch(
  provider: string,
  url: string,
  init: RequestInit,
  context: ProviderRequestContext,
): Promise<Response> {
  try {
    const response = await fetch(url, { ...init, signal: providerAbortSignal(context) });
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw new ProviderError({
        code: `${provider.toUpperCase()}_HTTP_${response.status}`,
        message: `${provider} request failed.`,
        provider,
        failureClass: retryable ? 'RETRYABLE' : 'NON_RETRYABLE',
        statusCode: response.status,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const timeout = error instanceof DOMException && error.name === 'TimeoutError';
    throw new ProviderError({
      code: timeout ? `${provider.toUpperCase()}_TIMEOUT` : `${provider.toUpperCase()}_NETWORK_ERROR`,
      message: timeout ? `${provider} timed out.` : `${provider} could not be reached.`,
      provider,
      failureClass: 'RETRYABLE',
      cause: error,
    });
  }
}

export function normalizeProviderSocketError(provider: string, error: unknown): ProviderError {
  return error instanceof ProviderError
    ? error
    : new ProviderError({
        code: `${provider.toUpperCase()}_SOCKET_ERROR`,
        message: `${provider} realtime connection failed.`,
        provider,
        failureClass: 'RETRYABLE',
        cause: error,
      });
}

