import 'reflect-metadata';

import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { loadEnvironment } from '@montenegrina/config';

import { AppModule } from './app.module.js';
import { ErrorFilter } from './core/error.filter.js';
import { registerRequestIdHook } from './core/request-id.hook.js';

const environment = loadEnvironment();
const adapter = new FastifyAdapter({
  bodyLimit: 1_048_576,
  trustProxy: environment.NODE_ENV === 'production',
  logger: {
    level: environment.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers.set-cookie',
        '*.password',
        '*.apiKey',
        '*.secret',
      ],
      censor: '[REDACTED]',
    },
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
  limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 20 },
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
application.useGlobalFilters(new ErrorFilter());
application.enableShutdownHooks();
await application.listen(environment.API_PORT, '0.0.0.0');
