import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => value || undefined);

function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isProductionLikeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return !isLocalUrl(value) && ['https:', 'wss:'].includes(url.protocol);
  } catch {
    return false;
  }
}

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
    S3_BUCKET: z.string().min(3).optional(),
    S3_ACCESS_KEY_ID: optionalSecret,
    S3_SECRET_ACCESS_KEY: optionalSecret,
    STORAGE_BACKEND: z.enum(['s3', 'azure']).default('s3'),
    AZURE_STORAGE_ACCOUNT_URL: z.url().optional(),
    AZURE_STORAGE_CONTAINER: z.string().min(3).default('montenegrina'),
    AZURE_CLIENT_ID: z.uuid().optional(),
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
    OPENAI_MODEL: z.string().default('gpt-5.4'),
    OPENAI_REALTIME_MODEL: z.string().default('gpt-realtime-2'),
    OPENAI_STT_MODEL: z.string().default('gpt-4o-transcribe'),
    OPENAI_TTS_MODEL: z.string().default('gpt-4o-mini-tts'),
    OPENAI_TTS_VOICE: z.string().default('ash'),
    OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-large'),
    OPENAI_EMBEDDING_DIMENSIONS: z.coerce.number().int().min(256).max(3072).default(1536),
    DEEPGRAM_API_KEY: optionalSecret,
    DEEPGRAM_MODEL: z.string().default('nova-3'),
    ELEVENLABS_API_KEY: optionalSecret,
    ELEVENLABS_MODEL: z.string().default('eleven_flash_v2_5'),
    ELEVENLABS_MONTENEGRIN_VOICE_ID: optionalSecret,
    VOICE_STT_PROVIDER: z.enum(['openai', 'deepgram']).default('openai'),
    VOICE_TTS_PROVIDER: z.enum(['elevenlabs', 'openai']).default('elevenlabs'),
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
    KNOWLEDGE_MAX_DOCUMENT_MIB: z.coerce.number().int().min(1).max(250).default(50),
    KNOWLEDGE_MAX_BULK_MIB: z.coerce.number().int().min(1).max(1_000).default(100),
    KNOWLEDGE_PARSER_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(1_800).default(600),
    KNOWLEDGE_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
    KNOWLEDGE_RETRIEVAL_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
    MNE_MCP_ENABLED: booleanFromString,
    MNE_MCP_API_URL: z.url().default('https://api.mne-mcp.com'),
    MNE_MCP_API_KEY: optionalSecret,
    MNE_MCP_TIMEOUT_MS: z.coerce.number().int().min(100).max(5_000).default(1_200),
    MNE_MCP_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(3_600).default(60),
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
    const productionLikePublicUrl =
      isProductionLikeUrl(environment.PUBLIC_API_URL) ||
      isProductionLikeUrl(environment.PUBLIC_WEB_URL) ||
      isProductionLikeUrl(environment.PUBLIC_LIVEKIT_URL) ||
      isProductionLikeUrl(environment.LIVEKIT_URL);
    if (productionLikePublicUrl && environment.NODE_ENV !== 'production') {
      context.addIssue({
        code: 'custom',
        path: ['NODE_ENV'],
        message: 'Production-like public URLs require NODE_ENV=production',
      });
    }
    if (environment.NODE_ENV === 'production' && !environment.COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true in production',
      });
    }
    if (
      environment.S3_ENDPOINT &&
      environment.STORAGE_BACKEND === 's3' &&
      (!environment.S3_ACCESS_KEY_ID || !environment.S3_SECRET_ACCESS_KEY)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['S3_ACCESS_KEY_ID'],
        message: 'Explicit S3 credentials are required for S3-compatible local storage',
      });
    }
    if (environment.STORAGE_BACKEND === 's3' && !environment.S3_BUCKET) {
      context.addIssue({
        code: 'custom',
        path: ['S3_BUCKET'],
        message: 'S3_BUCKET is required when STORAGE_BACKEND=s3',
      });
    }
    if (environment.STORAGE_BACKEND === 'azure' && !environment.AZURE_STORAGE_ACCOUNT_URL) {
      context.addIssue({
        code: 'custom',
        path: ['AZURE_STORAGE_ACCOUNT_URL'],
        message: 'AZURE_STORAGE_ACCOUNT_URL is required for Azure storage',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.STORAGE_BACKEND === 'azure' &&
      !environment.AZURE_CLIENT_ID
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AZURE_CLIENT_ID'],
        message: 'A user-assigned managed identity client ID is required for Azure storage',
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
        isLocalUrl(environment.PUBLIC_API_URL) ||
        isLocalUrl(environment.PUBLIC_WEB_URL) ||
        isLocalUrl(environment.PUBLIC_LIVEKIT_URL) ||
        isLocalUrl(environment.LIVEKIT_URL)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['PUBLIC_WEB_URL'],
          message: 'Production public URLs cannot point at localhost',
        });
      }
      if (
        !environment.PUBLIC_LIVEKIT_URL.startsWith('wss://') ||
        !environment.LIVEKIT_URL.startsWith('wss://')
      ) {
        context.addIssue({
          code: 'custom',
          path: ['PUBLIC_LIVEKIT_URL'],
          message: 'Production LiveKit URLs must use secure WebSockets',
        });
      }
      if (environment.PUBLIC_API_URL === environment.PUBLIC_WEB_URL) {
        context.addIssue({
          code: 'custom',
          path: ['PUBLIC_API_URL'],
          message: 'Production API and web public URLs must be distinct',
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

    if (!environment.OPENAI_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required; runtime provider doubles are not supported',
      });
    }
    if (environment.VOICE_STT_PROVIDER === 'deepgram' && !environment.DEEPGRAM_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['DEEPGRAM_API_KEY'],
        message: 'DEEPGRAM_API_KEY is required when VOICE_STT_PROVIDER=deepgram',
      });
    }
    if (environment.VOICE_TTS_PROVIDER === 'elevenlabs') {
      for (const key of ['ELEVENLABS_API_KEY', 'ELEVENLABS_MONTENEGRIN_VOICE_ID'] as const) {
        if (!environment[key]) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when VOICE_TTS_PROVIDER=elevenlabs`,
          });
        }
      }
    }
    if (environment.MNE_MCP_ENABLED) {
      if (!environment.MNE_MCP_API_KEY) {
        context.addIssue({
          code: 'custom',
          path: ['MNE_MCP_API_KEY'],
          message: 'MNE_MCP_API_KEY is required when MNE_MCP_ENABLED=true',
        });
      }
      if (
        environment.NODE_ENV === 'production' &&
        !environment.MNE_MCP_API_URL.startsWith('https://')
      ) {
        context.addIssue({
          code: 'custom',
          path: ['MNE_MCP_API_URL'],
          message: 'MNE_MCP_API_URL must use HTTPS in production',
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
