import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';

import { loggerRedaction } from '../../src/core/logger-redaction.js';
import { HealthController } from '../../src/health/health.controller.js';

describe('production diagnostics', () => {
  it('returns HTTP 503 when a readiness dependency fails', async () => {
    const status = vi.fn();
    const controller = new HealthController(
      { pool: { query: vi.fn().mockRejectedValue(new Error('database unavailable')) } } as never,
      { ping: vi.fn().mockResolvedValue('ok') } as never,
      { ping: vi.fn().mockResolvedValue('PONG') } as never,
      {} as never,
    );

    const result = await controller.ready({ status } as never);

    expect(status).toHaveBeenCalledWith(503);
    expect(result).toMatchObject({ ok: false, status: 'failed', checks: { postgres: 'failed' } });
  });

  it('redacts credentials and verification secrets from structured request logs', () => {
    let output = '';
    const logger = pino(
      { redact: loggerRedaction },
      {
        write: (chunk: string) => {
          output += chunk;
        },
      },
    );
    logger.info({
      req: {
        headers: { authorization: 'Bearer live-secret', cookie: 'session=live-cookie' },
        body: {
          password: 'correct-horse-battery-staple',
          token: 'verification-token',
          turnstileToken: 'turnstile-token',
          credential: 'google-credential',
        },
      },
    });

    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('live-secret');
    expect(output).not.toContain('live-cookie');
    expect(output).not.toContain('correct-horse-battery-staple');
    expect(output).not.toContain('verification-token');
    expect(output).not.toContain('turnstile-token');
    expect(output).not.toContain('google-credential');
  });
});
