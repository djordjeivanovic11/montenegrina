import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => value || undefined);

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    WEB_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    PUBLIC_API_URL: z.url().default('http://localhost:3001'),
    PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
    PUBLIC_LIVEKIT_URL: z.string().min(1).default('ws://localhost:7880'),
    REGISTRATION_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    STRIPE_SECRET_KEY: optionalSecret,
    STRIPE_WEBHOOK_SECRET: optionalSecret,
    STRIPE_PRICE_PRO: optionalSecret,
    STRIPE_PRICE_BUSINESS: optionalSecret,
    SENTRY_DSN: optionalSecret,
    SENTRY_ENABLED: booleanFromString,
    INTERNAL_API_URL: z.url().default('http://api:3001'),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.url(),
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY_ID: optionalSecret,
    S3_SECRET_ACCESS_KEY: optionalSecret,
    STORAGE_BACKEND: z.enum(['s3', 'azure']).default('s3'),
    AZURE_STORAGE_ACCOUNT_URL: z.url().optional(),
    AZURE_STORAGE_CONTAINER: z.string().min(3).default('montenegrina'),
    SESSION_SECRET: z.string().min(16),
    INTERNAL_TOKEN_SECRET: z.string().min(16),
    COOKIE_SECURE: booleanFromString,
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((value) => value.split(',').map((origin) => origin.trim())),
    LIVEKIT_URL: z.string().min(1),
    LIVEKIT_API_KEY: z.string().min(1),
    LIVEKIT_API_SECRET: z.string().min(1),
    LIVEKIT_SIP_OUTBOUND_TRUNK_ID: optionalSecret,
    LIVEKIT_SIP_INBOUND_TRUNK_ID: optionalSecret,
    LIVEKIT_WEBHOOK_SECRET: optionalSecret,
    VOICE_AGENT_SERVICE_SECRET: optionalSecret,
    LIVEKIT_EGRESS_S3_ACCESS_KEY_ID: optionalSecret,
    LIVEKIT_EGRESS_S3_SECRET_ACCESS_KEY: optionalSecret,
    GOOGLE_CLIENT_ID: z.string().optional(),
    OPENAI_API_KEY: optionalSecret,
    OPENAI_MODEL: z.string().default('gpt-5.4-mini'),
    OPENAI_REALTIME_MODEL: z.string().default('gpt-realtime-2'),
    OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-large'),
    OPENAI_EMBEDDING_DIMENSIONS: z.coerce.number().int().min(256).max(3072).default(1536),
    DEEPGRAM_API_KEY: optionalSecret,
    DEEPGRAM_MODEL: z.string().default('nova-3'),
    ELEVENLABS_API_KEY: optionalSecret,
    ELEVENLABS_MODEL: z.string().default('eleven_flash_v2_5'),
    ELEVENLABS_MONTENEGRIN_VOICE_ID: optionalSecret,
    OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    TRANSCRIPT_RETENTION_DAYS: z.coerce.number().int().min(0).default(30),
    AUDIO_RETENTION_DAYS: z.coerce.number().int().min(0).default(7),
    AUDIT_RETENTION_DAYS: z.coerce.number().int().min(1).default(365),
    EVALUATION_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),
    MAX_CONVERSATION_MINUTES: z.coerce.number().int().min(1).max(240).default(30),
    MAX_CONCURRENT_SESSIONS: z.coerce.number().int().min(1).max(1_000).default(25),
    KNOWLEDGE_PARSER_URL: z.url().default('http://localhost:8090'),
    KNOWLEDGE_MAX_BULK_FILES: z.coerce.number().int().min(1).max(50).default(20),
    KNOWLEDGE_RETRIEVAL_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
    BILLING_ENABLED: booleanFromString,
    PHONE_INTEGRATIONS_ENABLED: booleanFromString,
    RECORDINGS_ENABLED: booleanFromString,
    WEBHOOKS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    PUBLIC_DEMO_ENABLED: booleanFromString,
    RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(20),
    RATE_LIMIT_VOICE_SESSIONS_PER_HOUR: z.coerce.number().int().min(1).max(10_000).default(60),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && !environment.COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true in production',
      });
    }
    if (
      environment.S3_ENDPOINT &&
      (!environment.S3_ACCESS_KEY_ID || !environment.S3_SECRET_ACCESS_KEY)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['S3_ACCESS_KEY_ID'],
        message: 'Explicit S3 credentials are required for S3-compatible local storage',
      });
    }
    if (environment.STORAGE_BACKEND === 'azure' && !environment.AZURE_STORAGE_ACCOUNT_URL) {
      context.addIssue({
        code: 'custom',
        path: ['AZURE_STORAGE_ACCOUNT_URL'],
        message: 'AZURE_STORAGE_ACCOUNT_URL is required for Azure storage',
      });
    }
    if (environment.NODE_ENV === 'production') {
      if (!environment.GOOGLE_CLIENT_ID) {
        context.addIssue({
          code: 'custom',
          path: ['GOOGLE_CLIENT_ID'],
          message: 'Google client ID is required in production',
        });
      }
      if (!environment.VOICE_AGENT_SERVICE_SECRET) {
        context.addIssue({
          code: 'custom',
          path: ['VOICE_AGENT_SERVICE_SECRET'],
          message: 'Voice-agent service authentication is required in production',
        });
      }
      if (
        !environment.PUBLIC_API_URL.startsWith('https://') ||
        !environment.PUBLIC_WEB_URL.startsWith('https://')
      ) {
        context.addIssue({
          code: 'custom',
          path: ['PUBLIC_WEB_URL'],
          message: 'Production public URLs must use HTTPS',
        });
      }
      if (
        environment.CORS_ORIGINS.length !== 1 ||
        environment.CORS_ORIGINS[0] !== environment.PUBLIC_WEB_URL
      ) {
        context.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: 'Production CORS must exactly match PUBLIC_WEB_URL',
        });
      }
    }

    for (const key of [
      'OPENAI_API_KEY',
      'DEEPGRAM_API_KEY',
      'ELEVENLABS_API_KEY',
      'ELEVENLABS_MONTENEGRIN_VOICE_ID',
    ] as const) {
      if (!environment[key]) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required; runtime provider doubles are not supported`,
        });
      }
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

export const runtimeDefaults = Object.freeze({
  providerConnectTimeoutMs: 3_000,
  modelFirstTokenTimeoutMs: 8_000,
  ttsFirstByteTimeoutMs: 5_000,
  toolTimeoutMs: 5_000,
  providerOperationTimeoutMs: 30_000,
  transientEventCapacity: 1_000,
  audioBufferDurationMs: 2_000,
  silenceWarningMs: 20_000,
  silenceTerminationMs: 60_000,
  maximumJsonBytes: 1_048_576,
  maximumUploadBytes: 26_214_400,
});
