import { ApiException } from '../core/api-exception.js';

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function normalizeE164(value: string): string {
  const trimmed = value.trim().replace(/[\s()-]/g, '');
  const normalized = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  if (!E164_PATTERN.test(normalized)) {
    throw new Error('Invalid E.164 phone number');
  }
  return normalized;
}

export function parseE164(value: string): string {
  try {
    return normalizeE164(value);
  } catch {
    throw new ApiException({
      code: 'INVALID_PHONE_NUMBER',
      message: 'Phone number must be in E.164 format (e.g. +38267123456).',
      status: 400,
    });
  }
}
