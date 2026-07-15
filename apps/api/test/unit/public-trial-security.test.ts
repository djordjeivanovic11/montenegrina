import { describe, expect, it, vi } from 'vitest';

import { ApiException } from '../../src/core/api-exception.js';
import { RateLimitGuard } from '../../src/security/rate-limit.guard.js';
import { SessionService } from '../../src/security/session.service.js';

function sessionService(database: unknown, environment: Record<string, unknown>) {
  return new SessionService(
    database as never,
    { ensurePersonalWorkspace: vi.fn() } as never,
    { sendEmailVerification: vi.fn(), sendWelcome: vi.fn() } as never,
    {} as never,
    environment as never,
  );
}

describe('public trial authentication security', () => {
  it.each([
    { usedAt: null, expiresAt: new Date(Date.now() - 1_000) },
    { usedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
  ])('rejects expired and already-used verification tokens', async (verification) => {
    const service = sessionService(
      {
        db: {
          query: {
            emailVerificationTokens: {
              findFirst: vi
                .fn()
                .mockResolvedValue({ id: 'token-1', userId: 'user-1', ...verification }),
            },
          },
        },
      },
      {},
    );

    await expect(service.verifyEmail('x'.repeat(32), {} as never)).rejects.toMatchObject({
      code: 'VERIFICATION_TOKEN_INVALID',
    });
  });

  it('rejects a token that loses the one-use claim race', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const transaction = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })),
      })),
    };
    const service = sessionService(
      {
        db: {
          query: {
            emailVerificationTokens: {
              findFirst: vi.fn().mockResolvedValue({
                id: 'token-1',
                userId: 'user-1',
                usedAt: null,
                expiresAt: new Date(Date.now() + 60_000),
              }),
            },
            users: {
              findFirst: vi.fn().mockResolvedValue({ id: 'user-1', disabledAt: null }),
            },
          },
          transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<void>) =>
            callback(transaction),
          ),
        },
      },
      {},
    );

    await expect(service.verifyEmail('x'.repeat(32), {} as never)).rejects.toMatchObject({
      code: 'VERIFICATION_TOKEN_INVALID',
    });
  });

  it('fails registration when Turnstile rejects the challenge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ success: false }) }),
    );
    const database = { db: { query: { users: { findFirst: vi.fn() } } } };
    const service = sessionService(database, {
      REGISTRATION_ENABLED: true,
      TURNSTILE_SECRET_KEY: 'turnstile-secret',
    });

    await expect(
      service.register(
        'person@example.com',
        'a-secure-password',
        'Person',
        'bad-token',
        '203.0.113.5',
        {} as never,
      ),
    ).rejects.toMatchObject({ code: 'BOT_CHECK_FAILED' });
    expect(database.db.query.users.findFirst).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('blocks new Google identities when registration is disabled', async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const service = sessionService(
      { db: { query: { users: { findFirst } } } },
      { REGISTRATION_ENABLED: false },
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
});

describe('RateLimitGuard public routes', () => {
  it('applies the auth limit to public login requests', async () => {
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
        RATE_LIMIT_REGISTRATIONS_PER_HOUR: 3,
        RATE_LIMIT_VERIFICATIONS_PER_DAY: 3,
        RATE_LIMIT_VOICE_SESSIONS_PER_HOUR: 3,
      } as never,
    );
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/v1/auth/login', ip: '203.0.113.9' }),
      }),
    } as never;

    for (let attempt = 0; attempt < 10; attempt += 1)
      await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ApiException);
  });

  it('counts registration verification sends against the per-email daily limit', async () => {
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
        RATE_LIMIT_AUTH_PER_MINUTE: 100,
        RATE_LIMIT_REGISTRATIONS_PER_HOUR: 100,
        RATE_LIMIT_VERIFICATIONS_PER_DAY: 3,
        RATE_LIMIT_VOICE_SESSIONS_PER_HOUR: 3,
      } as never,
    );
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          url: '/v1/auth/register',
          ip: '203.0.113.9',
          body: { email: ' Person@Example.com ' },
        }),
      }),
    } as never;

    for (let attempt = 0; attempt < 3; attempt += 1)
      await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
  });
});
