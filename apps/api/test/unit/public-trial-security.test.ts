import { describe, expect, it, vi } from 'vitest';

import { ApiException } from '../../src/core/api-exception.js';
import { RateLimitGuard } from '../../src/security/rate-limit.guard.js';
import { SessionService } from '../../src/security/session.service.js';

describe('Google-only public trial security', () => {
  it('blocks new Google identities when registration is disabled', async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const service = new SessionService(
      { db: { query: { users: { findFirst } } } } as never,
      { ensurePersonalWorkspace: vi.fn() } as never,
      {} as never,
      { REGISTRATION_ENABLED: false } as never,
    );

    await expect(
      service.loginWithGoogle(
        {
          googleId: 'google-user-1',
          email: 'person@example.com',
          displayName: 'Person',
        },
        {} as never,
      ),
    ).rejects.toMatchObject({ code: 'REGISTRATION_DISABLED', status: 503 });
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('limits Google authentication attempts per IP', async () => {
    const counts = new Map<string, number>();
    const redis = {
      incr: vi.fn(async (key: string) => {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      }),
      expire: vi.fn().mockResolvedValue(1),
    };
    const guard = new RateLimitGuard(
      redis as never,
      {
        RATE_LIMIT_AUTH_PER_MINUTE: 10,
        RATE_LIMIT_VOICE_SESSIONS_PER_HOUR: 3,
      } as never,
    );
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/v1/auth/google', ip: '203.0.113.9' }),
      }),
    } as never;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ApiException);
  });
});
