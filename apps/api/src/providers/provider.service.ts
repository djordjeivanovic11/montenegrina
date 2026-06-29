import { Inject, Injectable } from '@nestjs/common';
import { processMontenegrin } from '@montenegrina/language-cnr';
import { schema } from '@montenegrina/database';
import type {
  AudioFormat,
  ProviderMetadata,
  ProviderRequestContext,
} from '@montenegrina/provider-core';
import type { ProviderSet } from '@montenegrina/providers';
import { v7 as uuidv7 } from 'uuid';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { AgentsService } from '../agents/agents.service.js';
import type { RequestActor } from '../security/actor.js';
import { PROVIDERS } from '../core/tokens.js';
import { DatabaseService } from '../database/database.service.js';
import { RetrievalService } from '../knowledge/retrieval.service.js';

@Injectable()
export class ProviderService {
  constructor(
    @Inject(PROVIDERS) private readonly providers: ProviderSet,
    private readonly agents: AgentsService,
    private readonly database: DatabaseService,
    private readonly retrieval: RetrievalService,
  ) {}

  async transcribe(options: {
    actor: RequestActor;
    requestId: string;
    agentId: string;
    audio: Uint8Array;
    audioFormat: AudioFormat;
    sttLanguage?: 'sr' | 'hr' | 'bs' | 'multi';
  }) {
    const { version } = await this.agents.published(options.actor, options.agentId);
    if (version.config.routingPolicy.pipelineMode !== 'controlled') {
      throw new Error('Batch transcription requires the controlled provider pipeline');
    }
    const providerLanguage =
      options.sttLanguage ?? version.config.routingPolicy.sttLanguage ?? 'sr';
    const context = this.context(options.actor, options.requestId, options.agentId, version.config);
    const result = await this.providers.stt.transcribe(
      {
        audio: options.audio,
        audioFormat: options.audioFormat,
        providerLanguage,
        keyterms: [],
      },
      context,
    );
    const language = processMontenegrin(result.data.text, {
      outputScript: version.config.languageProfile.script,
      preferIjekavian: version.config.languageProfile.ijekavian,
    });
    await this.recordUsage(options.actor, options.agentId, undefined, 'transcription', result.metadata);
    return {
      language: 'cnr' as const,
      originalText: language.originalText,
      normalizedText: language.displayText,
      warnings: language.warnings.map((warning) => warning.code),
      provider: this.publicMetadata(result.metadata),
    };
  }

  async respond(options: {
    actor: RequestActor;
    requestId: string;
    agentId: string;
    input: string;
    conversationId?: string;
  }) {
    const { version } = await this.agents.published(options.actor, options.agentId);
    const convId = options.conversationId ?? uuidv7();
    if (!options.conversationId) {
      await this.database.db.insert(schema.conversations).values({
        id: convId,
        organizationId: options.actor.organizationId as string,
        agentId: options.agentId,
        agentVersionId: version.id,
        channel: 'TEXT',
        state: 'LISTENING',
        language: 'cnr',
        traceId: options.requestId.replaceAll('-', '').slice(0, 32),
        startedAt: new Date(),
      });
    }
    const context = this.context(
      options.actor,
      options.requestId,
      options.agentId,
      version.config,
      convId,
    );
    const history = await this.database.db.query.transcriptSegments.findMany({
      where: and(
        eq(schema.transcriptSegments.organizationId, options.actor.organizationId as string),
        eq(schema.transcriptSegments.conversationId, convId),
      ),
      orderBy: [asc(schema.transcriptSegments.createdAt)],
      limit: 30,
    });
    const configuredIds =
      version.config.knowledgeBaseIds?.length
        ? version.config.knowledgeBaseIds
        : (version.config.knowledgeSourceIds ?? []);
    const sources = configuredIds.length
      ? await this.retrieval.retrieveForAgent(options.actor, options.agentId, options.input, {
          topK: 5,
          conversationId: convId,
        })
      : [];
    const sourceContext = this.retrieval.buildPromptBlock(sources);
    const messages = [
      ...history.map((s) => ({
        role: s.speaker === 'USER' ? ('user' as const) : ('assistant' as const),
        content: s.originalText,
      })),
      { role: 'user' as const, content: options.input },
    ];
    const result = await this.providers.llm.generate(
      {
        system: `${version.config.systemPrompt}${sourceContext}`,
        messages,
        ...(version.config.routingPolicy.llmModel
          ? { model: version.config.routingPolicy.llmModel }
          : {}),
      },
      context,
    );
    const language = processMontenegrin(result.data.text, {
      outputScript: version.config.languageProfile.script,
      preferIjekavian: version.config.languageProfile.ijekavian,
    });
    await this.recordUsage(
      options.actor,
      options.agentId,
      convId,
      'response',
      result.metadata,
    );
    const conversationStartedAtMs = options.conversationId
      ? (
          await this.database.db.query.conversations.findFirst({
            where: eq(schema.conversations.id, convId),
          })
        )?.startedAt.getTime() ?? Date.now()
      : Date.now();
    const offsetMs = Date.now() - conversationStartedAtMs;
    await this.database.db.insert(schema.transcriptSegments).values([
      {
        id: uuidv7(),
        organizationId: options.actor.organizationId as string,
        conversationId: convId,
        speaker: 'USER',
        originalText: options.input,
        normalizedText: options.input,
        startedAtMs: offsetMs,
        final: true,
      },
      {
        id: uuidv7(),
        organizationId: options.actor.organizationId as string,
        conversationId: convId,
        speaker: 'ASSISTANT',
        originalText: result.data.text,
        normalizedText: language.correctedText,
        startedAtMs: offsetMs + 1,
        final: true,
      },
    ]);
    const citedIndexes = new Set(
      [...language.correctedText.matchAll(/\[S(\d+)\]/gu)].map((match) => Number(match[1]) - 1),
    );
    return {
      language: 'cnr' as const,
      text: language.correctedText,
      originalText: language.originalText,
      warnings: language.warnings.map((warning) => warning.code),
      citations: sources
        .filter((_source, index) => citedIndexes.has(index))
        .map((source) => {
          const { content, ...citation } = source;
          void content;
          return citation;
        }),
      toolCalls: result.data.toolCalls,
      provider: this.publicMetadata(result.metadata),
      conversationId: convId,
    };
  }

  async listConversations(actor: RequestActor) {
    const items = await this.database.db.query.conversations.findMany({
      where: and(
        eq(schema.conversations.organizationId, actor.organizationId as string),
        isNull(schema.conversations.deletedAt),
      ),
      orderBy: [desc(schema.conversations.startedAt)],
      limit: 50,
    });
    return {
      items: items.map(c => ({
        id: c.id,
        agentId: c.agentId,
        channel: c.channel,
        startedAt: c.startedAt.toISOString(),
        state: c.state,
        calledE164: c.calledE164,
        callerE164: c.callerE164,
        hasRecording: Boolean(c.recordingObjectKey),
      })),
    };
  }

  async getConversationMessages(actor: RequestActor, conversationId: string) {
    const segments = await this.database.db.query.transcriptSegments.findMany({
      where: and(
        eq(schema.transcriptSegments.organizationId, actor.organizationId as string),
        eq(schema.transcriptSegments.conversationId, conversationId),
      ),
      orderBy: [asc(schema.transcriptSegments.createdAt)],
    });
    return {
      messages: segments.map(s => ({
        id: s.id,
        role: s.speaker === 'USER' ? 'user' : 'assistant',
        content: s.originalText,
        ts: s.createdAt.getTime(),
      })),
    };
  }

  async speech(options: {
    actor: RequestActor;
    requestId: string;
    agentId: string;
    text: string;
    outputFormat: AudioFormat;
  }) {
    const { version } = await this.agents.published(options.actor, options.agentId);
    const validated = processMontenegrin(options.text, {
      outputScript: version.config.languageProfile.script,
      preferIjekavian: version.config.languageProfile.ijekavian,
    });
    const result = await this.providers.tts.synthesize(
      {
        text: validated.spokenText,
        ...(version.config.routingPolicy.ttsModel
          ? { model: version.config.routingPolicy.ttsModel }
          : {}),
        outputFormat: options.outputFormat,
        pronunciationDictionaryIds: version.config.languageProfile.pronunciationIds,
      },
      this.context(options.actor, options.requestId, options.agentId, version.config),
    );
    await this.recordUsage(options.actor, options.agentId, undefined, 'speech', result.metadata);
    return result;
  }

  async embed(options: {
    actor: RequestActor;
    requestId: string;
    texts: string[];
    agentId?: string;
  }) {
    const context: ProviderRequestContext = {
      requestId: options.requestId,
      traceId: options.requestId.replaceAll('-', '').slice(0, 32),
      organizationId: options.actor.organizationId as string,
      ...(options.agentId ? { agentId: options.agentId } : {}),
      timeoutMs: 30_000,
      dataPolicy: {
        allowedProviders: [this.providers.embeddings.id],
        allowedRegions: ['local', 'global', 'eu'],
        allowFallback: false,
      },
    };
    const result = await this.providers.embeddings.embed({ texts: options.texts }, context);
    await this.recordUsage(options.actor, options.agentId, undefined, 'embedding', result.metadata);
    return { embeddings: result.data, provider: this.publicMetadata(result.metadata) };
  }

  private context(
    actor: RequestActor,
    requestId: string,
    agentId: string,
    config: schema.AgentConfigurationSnapshot,
    conversationId?: string,
  ): ProviderRequestContext {
    return {
      requestId,
      traceId: requestId.replaceAll('-', '').slice(0, 32),
      organizationId: actor.organizationId as string,
      agentId,
      ...(conversationId ? { conversationId } : {}),
      timeoutMs: 30_000,
      dataPolicy: {
        allowedProviders: config.routingPolicy.allowedProviders,
        allowedRegions: config.routingPolicy.allowedRegions,
        allowFallback: config.routingPolicy.fallbackAllowed,
      },
    };
  }

  private async recordUsage(
    actor: RequestActor,
    agentId: string | undefined,
    conversationId: string | undefined,
    operation: string,
    metadata: ProviderMetadata,
  ): Promise<void> {
    await this.database.db.insert(schema.usageRecords).values({
      id: uuidv7(),
      organizationId: actor.organizationId as string,
      agentId,
      conversationId,
      provider: metadata.provider,
      model: metadata.model,
      operation,
      inputTokens: metadata.usage.inputTokens,
      outputTokens: metadata.usage.outputTokens,
      audioInputSeconds: metadata.usage.audioInputSeconds,
      audioOutputSeconds: metadata.usage.audioOutputSeconds,
      characters: metadata.usage.characters,
      estimatedCostUsd: metadata.usage.estimatedCostUsd?.toFixed(8),
      providerRequestId: metadata.requestId,
    });
  }

  private publicMetadata(metadata: ProviderMetadata) {
    return {
      provider: metadata.provider,
      model: metadata.model,
      latencyMs: metadata.latencyMs,
      usage: metadata.usage,
      fallbackHistory: metadata.fallbackHistory ?? [],
    };
  }
}
