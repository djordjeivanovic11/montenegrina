import { describe, expect, it } from 'vitest';

import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  signWebhookPayload,
  webhookSignatureHeader,
} from '../../src/core/webhook-crypto.js';

describe('webhook-crypto', () => {
  const platformSecret = 'local-runtime-secret-change-in-deployment';

  it('encrypts and decrypts webhook secrets', () => {
    const secret = 'whsec_test_secret_value';
    const ciphertext = encryptWebhookSecret(secret, platformSecret);
    expect(decryptWebhookSecret(ciphertext, platformSecret)).toBe(secret);
  });

  it('signs payloads deterministically', () => {
    const payload = JSON.stringify({ event: 'document.ready', documentId: 'doc-1' });
    const signature = signWebhookPayload(payload, 'whsec_signing');
    expect(signature).toHaveLength(64);
    expect(webhookSignatureHeader(payload, 'whsec_signing')).toBe(`sha256=${signature}`);
  });
});
