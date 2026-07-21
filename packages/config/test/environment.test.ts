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

const productionUrls = {
  PUBLIC_API_URL: 'https://api.voice.mne-mcp.com',
  PUBLIC_WEB_URL: 'https://voice.mne-mcp.com',
  PUBLIC_LIVEKIT_URL: 'wss://montenegrina-pfkzdzqn.livekit.cloud',
  LIVEKIT_URL: 'wss://montenegrina-pfkzdzqn.livekit.cloud',
  CORS_ORIGINS: 'https://voice.mne-mcp.com',
};

describe('environmentSchema', () => {
  it('loads the production provider configuration', () => {
    const environment = environmentSchema.parse(valid);

    expect(environment.OPENAI_MODEL).toBe('gpt-5.4');
    expect(environment.OPENAI_STT_MODEL).toBe('gpt-4o-transcribe');
    expect(environment.VOICE_STT_PROVIDER).toBe('openai');
    expect(environment.VOICE_TTS_PROVIDER).toBe('elevenlabs');
    expect(environment.KNOWLEDGE_MAX_DOCUMENT_MIB).toBe(50);
    expect(environment.KNOWLEDGE_MAX_BULK_MIB).toBe(100);
    expect(environment.KNOWLEDGE_PARSER_TIMEOUT_SECONDS).toBe(600);
    expect(environment.KNOWLEDGE_WORKER_CONCURRENCY).toBe(3);
  });

  it('rejects unsafe knowledge ingestion limits', () => {
    expect(() =>
      environmentSchema.parse({ ...valid, KNOWLEDGE_MAX_DOCUMENT_MIB: '251' }),
    ).toThrow();
    expect(() =>
      environmentSchema.parse({ ...valid, KNOWLEDGE_WORKER_CONCURRENCY: '0' }),
    ).toThrow();
  });

  it('rejects missing provider credentials', () => {
    expect(() => environmentSchema.parse({ ...valid, OPENAI_API_KEY: '' })).toThrow();
    expect(() =>
      environmentSchema.parse({
        ...valid,
        VOICE_STT_PROVIDER: 'deepgram',
        DEEPGRAM_API_KEY: '',
      }),
    ).toThrow(/DEEPGRAM_API_KEY/);
    expect(() =>
      environmentSchema.parse({
        ...valid,
        VOICE_TTS_PROVIDER: 'openai',
        ELEVENLABS_API_KEY: '',
        ELEVENLABS_MONTENEGRIN_VOICE_ID: '',
      }),
    ).not.toThrow();
  });

  it('requires secure cookies in production', () => {
    expect(() => environmentSchema.parse({ ...valid, NODE_ENV: 'production' })).toThrow();
  });

  it('accepts only the complete exact-origin Azure public-trial configuration in production', () => {
    const withoutS3 = Object.fromEntries(
      Object.entries(valid).filter(
        ([key]) =>
          !['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].includes(key),
      ),
    );
    const production = environmentSchema.parse({
      ...withoutS3,
      NODE_ENV: 'production',
      ...productionUrls,
      COOKIE_SECURE: 'true',
      GOOGLE_CLIENT_ID: 'google-client-id',
      STORAGE_BACKEND: 'azure',
      AZURE_STORAGE_ACCOUNT_URL: 'https://store.blob.core.windows.net',
      AZURE_CLIENT_ID: '10fd6090-5f4e-4e92-9453-c9bdc3fa70ee',
      RECORDINGS_ENABLED: 'false',
    });

    expect(production.CORS_ORIGINS).toEqual(['https://voice.mne-mcp.com']);
    expect(production.STORAGE_BACKEND).toBe('azure');
    expect(production.S3_BUCKET).toBeUndefined();
    expect(production.RECORDINGS_ENABLED).toBe(false);
  });

  it('requires an explicit user-assigned identity for production Azure storage', () => {
    expect(() =>
      environmentSchema.parse({
        ...valid,
        NODE_ENV: 'production',
        ...productionUrls,
        COOKIE_SECURE: 'true',
        GOOGLE_CLIENT_ID: 'google-client-id',
        STORAGE_BACKEND: 'azure',
        AZURE_STORAGE_ACCOUNT_URL: 'https://store.blob.core.windows.net',
      }),
    ).toThrow(/AZURE_CLIENT_ID/);
  });

  it('rejects an additional production CORS origin', () => {
    expect(() =>
      environmentSchema.parse({
        ...valid,
        NODE_ENV: 'production',
        ...productionUrls,
        CORS_ORIGINS: 'https://voice.mne-mcp.com,https://evil.example',
        COOKIE_SECURE: 'true',
        GOOGLE_CLIENT_ID: 'google-client-id',
      }),
    ).toThrow();
  });

  it('rejects production-like URLs when NODE_ENV remains development', () => {
    expect(() =>
      environmentSchema.parse({
        ...valid,
        PUBLIC_WEB_URL: 'https://voice.mne-mcp.com',
        PUBLIC_API_URL: 'https://api.voice.mne-mcp.com',
        PUBLIC_LIVEKIT_URL: 'wss://montenegrina-pfkzdzqn.livekit.cloud',
      }),
    ).toThrow(/NODE_ENV/);
  });

  it('rejects insecure or duplicate production public endpoints', () => {
    expect(() =>
      environmentSchema.parse({
        ...valid,
        NODE_ENV: 'production',
        ...productionUrls,
        PUBLIC_LIVEKIT_URL: 'ws://localhost:7880',
        COOKIE_SECURE: 'true',
        GOOGLE_CLIENT_ID: 'google-client-id',
      }),
    ).toThrow(/LiveKit/);
    expect(() =>
      environmentSchema.parse({
        ...valid,
        NODE_ENV: 'production',
        ...productionUrls,
        PUBLIC_API_URL: 'https://voice.mne-mcp.com',
        COOKIE_SECURE: 'true',
        GOOGLE_CLIENT_ID: 'google-client-id',
      }),
    ).toThrow(/distinct/);
  });
});
