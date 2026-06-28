import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

const IV_LENGTH = 12;

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(`montenegrina:webhook:${secret}`).digest();
}

export function encryptWebhookSecret(plaintext: string, platformSecret: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(platformSecret), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decryptWebhookSecret(ciphertext: string, platformSecret: string): string {
  const buffer = Buffer.from(ciphertext, 'base64url');
  const iv = buffer.subarray(0, IV_LENGTH);
  const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = buffer.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(platformSecret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function signWebhookPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function webhookSignatureHeader(payload: string, secret: string): string {
  return `sha256=${signWebhookPayload(payload, secret)}`;
}
