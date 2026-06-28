import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { loadEnvironment, type Environment } from '@montenegrina/config';
import { createProviderRegistry } from '@montenegrina/providers';
import { Redis } from 'ioredis';

import { AgentsController } from './agents/agents.controller.js';
import { AgentsService } from './agents/agents.service.js';
import { AuditService } from './audit/audit.service.js';
import { ConversationsController } from './conversations/conversations.controller.js';
import { ConversationsService } from './conversations/conversations.service.js';
import { ENVIRONMENT, PROVIDERS, REDIS } from './core/tokens.js';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';
import { OpenApiController } from './openapi/openapi.controller.js';
import { InternalController } from './internal/internal.controller.js';
import { InternalGuard } from './internal/internal.guard.js';
import { InternalTokenService } from './internal/internal-token.service.js';
import { KnowledgeController } from './knowledge/knowledge.controller.js';
import { KnowledgeService } from './knowledge/knowledge.service.js';
import { SafeWebFetcher } from './knowledge/safe-web-fetcher.js';
import { OrganizationsController } from './organizations/organizations.controller.js';
import { ProviderController } from './providers/provider.controller.js';
import { ProviderService } from './providers/provider.service.js';
import { AuthController } from './security/auth.controller.js';
import { AuthGuard } from './security/auth.guard.js';
import { SessionService } from './security/session.service.js';
import { ObjectStorageService } from './storage/object-storage.service.js';
import { EvaluationsController } from './evaluations/evaluations.controller.js';
import { EvaluationsService } from './evaluations/evaluations.service.js';
import { ToolsController } from './tools/tools.controller.js';
import { ToolsService } from './tools/tools.service.js';
import { UsageController } from './usage/usage.controller.js';

const environment = loadEnvironment();

@Module({
  controllers: [
    HealthController,
    OpenApiController,
    AuthController,
    OrganizationsController,
    AgentsController,
    ProviderController,
    ConversationsController,
    InternalController,
    KnowledgeController,
    ToolsController,
    EvaluationsController,
    UsageController,
  ],
  providers: [
    { provide: ENVIRONMENT, useValue: environment },
    {
      provide: DatabaseService,
      inject: [ENVIRONMENT],
      useFactory: (config: Environment) => new DatabaseService(config.DATABASE_URL),
    },
    {
      provide: REDIS,
      inject: [ENVIRONMENT],
      useFactory: (config: Environment) =>
        new Redis(config.REDIS_URL, {
          maxRetriesPerRequest: 2,
          enableReadyCheck: true,
          lazyConnect: false,
        }),
    },
    {
      provide: PROVIDERS,
      inject: [ENVIRONMENT],
      useFactory: (config: Environment) =>
        createProviderRegistry({
                deepgram: {
                  apiKey: config.DEEPGRAM_API_KEY as string,
                  model: config.DEEPGRAM_MODEL,
                  providerLanguage: 'sr',
                },
                openai: {
                  apiKey: config.OPENAI_API_KEY as string,
                  languageModel: config.OPENAI_MODEL,
                  reasoningEffort: 'none',
                  embeddingModel: config.OPENAI_EMBEDDING_MODEL,
                  embeddingDimensions: config.OPENAI_EMBEDDING_DIMENSIONS,
                },
                elevenLabs: {
                  apiKey: config.ELEVENLABS_API_KEY as string,
                  model: config.ELEVENLABS_MODEL,
                  voiceId: config.ELEVENLABS_MONTENEGRIN_VOICE_ID as string,
                  outputFormat: { encoding: 'pcm_s16le', sampleRate: 24_000, channels: 1 },
                },
                openaiRealtime: {
                  apiKey: config.OPENAI_API_KEY as string,
                  model: config.OPENAI_REALTIME_MODEL,
                  reasoningEffort: 'none',
                },
              }),
    },
    SessionService,
    AuditService,
    AgentsService,
    ProviderService,
    InternalTokenService,
    InternalGuard,
    ConversationsService,
    ObjectStorageService,
    SafeWebFetcher,
    KnowledgeService,
    ToolsService,
    EvaluationsService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
