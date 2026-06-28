import { ProviderError, type ProviderRequestContext, type ProviderResult } from './types.js';

export interface ProviderCandidate<TProvider> {
  id: string;
  provider: TProvider;
  region?: string;
  priority: number;
  dataCategories: readonly string[];
}

export interface CircuitBreaker {
  canAttempt(key: string): Promise<boolean>;
  recordSuccess(key: string): Promise<void>;
  recordFailure(key: string): Promise<void>;
}

interface CircuitState {
  failures: number[];
  openedAt?: number;
  halfOpenAttempted?: boolean;
}

export class MemoryCircuitBreaker implements CircuitBreaker {
  readonly #states = new Map<string, CircuitState>();

  constructor(
    private readonly failureThreshold = 5,
    private readonly rollingWindowMs = 30_000,
    private readonly openDurationMs = 60_000,
  ) {}

  async canAttempt(key: string): Promise<boolean> {
    const now = Date.now();
    const state = this.#states.get(key);
    if (!state?.openedAt) return true;
    if (now - state.openedAt < this.openDurationMs) return false;
    if (state.halfOpenAttempted) return false;
    state.halfOpenAttempted = true;
    return true;
  }

  async recordSuccess(key: string): Promise<void> {
    this.#states.delete(key);
  }

  async recordFailure(key: string): Promise<void> {
    const now = Date.now();
    const state = this.#states.get(key) ?? { failures: [] };
    state.failures = state.failures.filter((failure) => now - failure <= this.rollingWindowMs);
    state.failures.push(now);
    if (state.halfOpenAttempted || state.failures.length >= this.failureThreshold) {
      state.openedAt = now;
      state.halfOpenAttempted = false;
    }
    this.#states.set(key, state);
  }
}

export function eligibleCandidates<TProvider>(
  candidates: readonly ProviderCandidate<TProvider>[],
  context: ProviderRequestContext,
): ProviderCandidate<TProvider>[] {
  return candidates
    .filter((candidate) => context.dataPolicy.allowedProviders.includes(candidate.id))
    .filter(
      (candidate) =>
        !candidate.region || context.dataPolicy.allowedRegions.includes(candidate.region),
    )
    .sort((left, right) => left.priority - right.priority);
}

export async function executeWithFallback<TProvider, TResult>(options: {
  candidates: readonly ProviderCandidate<TProvider>[];
  context: ProviderRequestContext;
  circuitBreaker: CircuitBreaker;
  operation(provider: TProvider): Promise<ProviderResult<TResult>>;
  breakerKey?(candidate: ProviderCandidate<TProvider>): string;
}): Promise<ProviderResult<TResult>> {
  const eligible = eligibleCandidates(options.candidates, options.context);
  if (eligible.length === 0) {
    throw new ProviderError({
      code: 'PROVIDER_POLICY_NO_ELIGIBLE_CANDIDATE',
      message: 'No provider satisfies the organization data policy.',
      provider: 'router',
      failureClass: 'ESCALATION_REQUIRED',
    });
  }

  const failures: Array<{ provider: string; code: string; retryable: boolean }> = [];
  const attempts = options.context.dataPolicy.allowFallback ? eligible : eligible.slice(0, 1);
  for (const candidate of attempts) {
    const key = options.breakerKey?.(candidate) ?? candidate.id;
    if (!(await options.circuitBreaker.canAttempt(key))) {
      failures.push({ provider: candidate.id, code: 'CIRCUIT_OPEN', retryable: true });
      continue;
    }
    try {
      const result = await options.operation(candidate.provider);
      await options.circuitBreaker.recordSuccess(key);
      result.metadata.fallbackHistory = failures;
      return result;
    } catch (error) {
      const normalized =
        error instanceof ProviderError
          ? error
          : new ProviderError({
              code: 'PROVIDER_UNEXPECTED_ERROR',
              message: 'The provider returned an unexpected error.',
              provider: candidate.id,
              failureClass: 'NON_RETRYABLE',
              cause: error,
            });
      await options.circuitBreaker.recordFailure(key);
      failures.push({ provider: candidate.id, code: normalized.code, retryable: normalized.retryable });
      if (!normalized.retryable) throw normalized;
    }
  }

  throw new ProviderError({
    code: 'ALL_PROVIDERS_UNAVAILABLE',
    message: 'All eligible providers are unavailable. Human handoff is required.',
    provider: 'router',
    failureClass: 'ESCALATION_REQUIRED',
    safeDetails: { failures },
  });
}

