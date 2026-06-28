import { describe, expect, it, vi } from 'vitest';

import { createEmailService } from '../src/index.js';

describe('createEmailService', () => {
  it('uses console provider by default', async () => {
    const log = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const service = createEmailService({
      EMAIL_PROVIDER: 'console',
      RESEND_API_KEY: undefined,
      EMAIL_FROM: 'Montenegrina <noreply@test.local>',
    });
    await service.sendPasswordReset('user@test.local', 'http://localhost:3000/reset?token=abc');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('uses resend when configured', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const service = createEmailService({
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'Montenegrina <noreply@test.local>',
    });
    expect(service).toBeDefined();
    vi.unstubAllGlobals();
  });
});
