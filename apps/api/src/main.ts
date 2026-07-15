import 'reflect-metadata';

import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { loadEnvironment } from '@montenegrina/config';

import { AppModule } from './app.module.js';
import { ErrorFilter } from './core/error.filter.js';
import { loggerRedaction } from './core/logger-redaction.js';
import { registerRequestIdHook } from './core/request-id.hook.js';

const environment = loadEnvironment();

if (environment.SENTRY_ENABLED && environment.SENTRY_DSN) {
  const { init } = await import('@sentry/node');
  init({ dsn: environment.SENTRY_DSN, environment: environment.NODE_ENV, tracesSampleRate: 0.1 });
}

const adapter = new FastifyAdapter({
  bodyLimit: 1_048_576,
  trustProxy: environment.NODE_ENV === 'production',
  logger: {
    level: environment.LOG_LEVEL,
    redact: loggerRedaction,
  },
});
const application = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
  bufferLogs: true,
});

await application.register(cookie, { secret: environment.SESSION_SECRET });
await application.register(
  helmet,
  environment.NODE_ENV === 'production' ? {} : { contentSecurityPolicy: false },
);
await application.register(multipart, {
  limits: {
    fileSize: environment.KNOWLEDGE_MAX_DOCUMENT_MIB * 1024 * 1024,
    files: environment.KNOWLEDGE_MAX_BULK_FILES,
    fields: 20,
  },
});
application.enableCors({
  origin: environment.CORS_ORIGINS,
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'Idempotency-Key',
    'X-CSRF-Token',
    'X-Organization-Id',
    'X-Request-Id',
  ],
});
registerRequestIdHook(application.getHttpAdapter().getInstance());
const fastify = application.getHttpAdapter().getInstance();
fastify.addHook('preParsing', async (request, _reply, payload) => {
  if (
    request.url?.startsWith('/v1/billing/stripe/webhook') ||
    request.url?.startsWith('/webhooks/livekit')
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk));
      } else if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else {
        chunks.push(Buffer.from(chunk as Uint8Array));
      }
    }
    const rawBody = Buffer.concat(chunks);
    request.rawBody = rawBody;
    return rawBody;
  }
  return payload;
});
fastify.addHook('onResponse', async (request, reply) => {
  const actor = request.actor;
  if (actor?.organizationId) {
    reply.header('X-Organization-Id', actor.organizationId);
  }
});
application.useGlobalFilters(new ErrorFilter());
application.enableShutdownHooks();
await application.listen(environment.API_PORT, '0.0.0.0');
