import { describe, expect, it } from 'vitest';

import { environmentSchema } from '../src/index.js';

const valid = {
  DATABASE_URL: 'postgresql://localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'test-bucket',
  S3_ACCESS_KEY_ID: 'test-key',
  S3_SECRET_ACCESS_KEY: 'test-secret',
  SESSION_SECRET: '1234567890123456',
  INTERNAL_TOKEN_SECRET: '1234567890123456',
  VOICE_AGENT_SERVICE_SECRET: '1234567890123456',
  LIVEKIT_URL: 'ws://localhost:7880',
  LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'secret',
  OPENAI_API_KEY: 'openai-test',
  DEEPGRAM_API_KEY: 'deepgram-test',
  ELEVENLABS_API_KEY: 'elevenlabs-test',
  ELEVENLABS_MONTENEGRIN_VOICE_ID: 'voice-test',
};

describe('environmentSchema', () => {
  it('loads the production provider configuration', () => {
    expect(environmentSchema.parse(valid).OPENAI_MODEL).toBe('gpt-5.4-mini');
  });

  it('rejects missing provider credentials', () => {
    expect(() => environmentSchema.parse({ ...valid, OPENAI_API_KEY: '' })).toThrow();
  });

  it('requires secure cookies in production', () => {
    expect(() => environmentSchema.parse({ ...valid, NODE_ENV: 'production' })).toThrow();
  });

  it('accepts only the complete exact-origin Azure public-trial configuration in production', () => {
    const production = environmentSchema.parse({
      ...valid,
      NODE_ENV: 'production',
      PUBLIC_API_URL: 'https://api.voice.mne-mcp.com',
      PUBLIC_WEB_URL: 'https://voice.mne-mcp.com',
      CORS_ORIGINS: 'https://voice.mne-mcp.com',
      COOKIE_SECURE: 'true',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 'resend-secret',
      EMAIL_VERIFICATION_REQUIRED: 'true',
      TURNSTILE_SECRET_KEY: 'turnstile-secret',
      GOOGLE_CLIENT_ID: 'google-client-id',
      STORAGE_BACKEND: 'azure',
      AZURE_STORAGE_ACCOUNT_URL: 'https://store.blob.core.windows.net',
      BOOTSTRAP_ADMIN_ENABLED: 'false',
      RECORDINGS_ENABLED: 'false',
    });

    expect(production.CORS_ORIGINS).toEqual(['https://voice.mne-mcp.com']);
    expect(production.STORAGE_BACKEND).toBe('azure');
    expect(production.RECORDINGS_ENABLED).toBe(false);
  });

  it('rejects an additional production CORS origin', () => {
    expect(() =>
      environmentSchema.parse({
        ...valid,
        NODE_ENV: 'production',
        PUBLIC_API_URL: 'https://api.voice.mne-mcp.com',
        PUBLIC_WEB_URL: 'https://voice.mne-mcp.com',
        CORS_ORIGINS: 'https://voice.mne-mcp.com,https://evil.example',
        COOKIE_SECURE: 'true',
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 'resend-secret',
        EMAIL_VERIFICATION_REQUIRED: 'true',
        TURNSTILE_SECRET_KEY: 'turnstile-secret',
        GOOGLE_CLIENT_ID: 'google-client-id',
        BOOTSTRAP_ADMIN_ENABLED: 'false',
      }),
    ).toThrow();
  });
});
