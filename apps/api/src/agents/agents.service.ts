import { Injectable } from '@nestjs/common';
import { defaultMontenegrinSystemInstruction } from '@montenegrina/language-cnr';
import { schema } from '@montenegrina/database';
import { and, asc, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { ApiException } from '../core/api-exception.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';

type AgentConfig = schema.AgentConfigurationSnapshot;

@Injectable()
export class AgentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(actor: RequestActor, cursor?: string, limit = 20) {
    const organizationId = this.organization(actor);
    const boundedLimit = Math.max(1, Math.min(100, limit));
    const active = and(eq(schema.agents.organizationId, organizationId), isNull(schema.agents.archivedAt));
    const items = await this.database.db.query.agents.findMany({
      where: cursor ? and(active, gt(schema.agents.id, cursor)) : active,
      orderBy: [asc(schema.agents.id)],
      limit: boundedLimit + 1,
    });
    const hasMore = items.length > boundedLimit;
    const page = items.slice(0, boundedLimit);
    return {
      items: page.map((item) => this.formatAgent(item)),
      ...(hasMore ? { nextCursor: page.at(-1)?.id } : {}),
    };
  }

  async get(actor: RequestActor, id: string) {
    const item = await this.find(actor, id);
    const config = await this.resolveActiveConfig(actor, item);
    return {
      ...this.formatAgent(item),
      ...(config ? { config } : {}),
    };
  }

  async create(actor: RequestActor, body: { name: string; slug: string; description?: string }) {
    const organizationId = this.organization(actor);
    await this.entitlements.assertWithinLimit(organizationId, 'AGENTS', 1);
    const id = uuidv7();
    await this.database.db.insert(schema.agents).values({
      id,
      organizationId,
      name: body.name,
      slug: body.slug,
      description: body.description ?? '',
    });
    return this.get(actor, id);
  }

  async update(actor: RequestActor, id: string, body: { name?: string; description?: string }) {
    await this.find(actor, id);
    await this.database.db
      .update(schema.agents)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(schema.agents.id, id), eq(schema.agents.organizationId, this.organization(actor))));
    return this.get(actor, id);
  }

  async createVersion(actor: RequestActor, agentId: string, config: AgentConfig) {
    const organizationId = this.organization(actor);
    await this.find(actor, agentId);
    this.validateConfig(config, false);
    const id = uuidv7();
    const promptVersionId = uuidv7();
    const languageProfileId = uuidv7();
    const routingPolicyId = uuidv7();
    const latest = await this.database.db.query.agentVersions.findFirst({
      where: and(
        eq(schema.agentVersions.organizationId, organizationId),
        eq(schema.agentVersions.agentId, agentId),
      ),
      orderBy: [desc(schema.agentVersions.version)],
    });
    const version = (latest?.version ?? 0) + 1;

    await this.database.db.transaction(async (transaction) => {
      await transaction.insert(schema.promptVersions).values({
        id: promptVersionId,
        organizationId,
        name: `agent-${agentId}`,
        version,
        systemInstruction: config.systemPrompt || defaultMontenegrinSystemInstruction,
        immutable: true,
      });
      await transaction.insert(schema.languageProfiles).values({
        id: languageProfileId,
        organizationId,
        name: `agent-${agentId}`,
        version,
        script: config.languageProfile.script,
        preferIjekavian: config.languageProfile.ijekavian,
        immutable: true,
      });
      await transaction.insert(schema.routingPolicies).values({
        id: routingPolicyId,
        organizationId,
        name: `agent-${agentId}-v${version}`,
        environment: 'development',
        domain: 'BROWSER',
        candidateConfigurationIds: [],
        allowedProviders: config.routingPolicy.allowedProviders,
        allowedRegions: config.routingPolicy.allowedRegions,
        allowFallback: config.routingPolicy.fallbackAllowed,
        sttLanguage: config.routingPolicy.sttLanguage,
        settings: {
          pipelineMode: config.routingPolicy.pipelineMode,
          sttProvider: config.routingPolicy.sttProvider,
          sttModel: config.routingPolicy.sttModel,
          ttsProvider: config.routingPolicy.ttsProvider,
          llmModel: config.routingPolicy.llmModel,
          ttsModel: config.routingPolicy.ttsModel,
          realtimeModel: config.routingPolicy.realtimeModel,
        },
      });
      await transaction.insert(schema.agentVersions).values({
        id,
        organizationId,
        agentId,
        version,
        status: 'DRAFT',
        promptVersionId,
        languageProfileId,
        routingPolicyId,
        config,
        createdBy: actor.userId,
      });
    });
    return this.version(actor, id);
  }

  async publish(actor: RequestActor, agentId: string, versionId: string) {
    const organizationId = this.organization(actor);
    await this.find(actor, agentId);
    const version = await this.database.db.query.agentVersions.findFirst({
      where: and(
        eq(schema.agentVersions.organizationId, organizationId),
        eq(schema.agentVersions.agentId, agentId),
        eq(schema.agentVersions.id, versionId),
      ),
    });
    if (!version) throw new ApiException({ code: 'AGENT_VERSION_NOT_FOUND', message: 'Agent version was not found.', status: 404 });
    this.validateConfig(version.config, true);
    await this.database.db.transaction(async (transaction) => {
      await transaction
        .update(schema.agentVersions)
        .set({ status: 'RETIRED' })
        .where(
          and(
            eq(schema.agentVersions.organizationId, organizationId),
            eq(schema.agentVersions.agentId, agentId),
            eq(schema.agentVersions.status, 'PUBLISHED'),
          ),
        );
      await transaction
        .update(schema.agentVersions)
        .set({ status: 'PUBLISHED', publishedAt: new Date() })
        .where(eq(schema.agentVersions.id, versionId));
      await transaction
        .update(schema.agents)
        .set({ publishedVersionId: versionId, updatedAt: new Date() })
        .where(and(eq(schema.agents.organizationId, organizationId), eq(schema.agents.id, agentId)));
      await this.syncKnowledgeBaseAssignments(transaction, organizationId, agentId, version.config.knowledgeBaseIds ?? []);
    });
    return this.get(actor, agentId);
  }

  async duplicate(actor: RequestActor, agentId: string) {
    const organizationId = this.organization(actor);
    await this.entitlements.assertWithinLimit(organizationId, 'AGENTS', 1);
    const source = await this.find(actor, agentId);
    const newId = uuidv7();
    const slug = `${source.slug}-copy-${newId.slice(0, 6)}`;
    await this.database.db.insert(schema.agents).values({
      id: newId,
      organizationId,
      name: `${source.name} (copy)`,
      slug,
      description: source.description,
    });
    const latest = await this.database.db.query.agentVersions.findFirst({
      where: and(eq(schema.agentVersions.organizationId, organizationId), eq(schema.agentVersions.agentId, agentId)),
      orderBy: [desc(schema.agentVersions.version)],
    });
    if (latest) {
      await this.createVersion(actor, newId, latest.config);
    }
    return this.get(actor, newId);
  }

  async archive(actor: RequestActor, agentId: string) {
    const item = await this.find(actor, agentId);
    if (item.archivedAt) {
      throw new ApiException({ code: 'AGENT_ALREADY_ARCHIVED', message: 'Agent is already archived.', status: 409 });
    }
    await this.database.db
      .update(schema.agents)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.organizationId, this.organization(actor))));
    return this.get(actor, agentId);
  }

  async published(actor: RequestActor, agentId: string) {
    const agent = await this.find(actor, agentId);
    if (!agent.publishedVersionId) {
      throw new ApiException({ code: 'AGENT_NOT_PUBLISHED', message: 'The agent has no published version.', status: 422 });
    }
    const version = await this.database.db.query.agentVersions.findFirst({
      where: and(
        eq(schema.agentVersions.organizationId, this.organization(actor)),
        eq(schema.agentVersions.id, agent.publishedVersionId),
      ),
    });
    if (!version) throw new ApiException({ code: 'PUBLISHED_VERSION_MISSING', message: 'Published agent configuration is unavailable.', status: 500 });
    return { agent, version };
  }

  private async syncKnowledgeBaseAssignments(
    transaction: Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0],
    organizationId: string,
    agentId: string,
    knowledgeBaseIds: string[],
  ): Promise<void> {
    await transaction
      .delete(schema.agentKnowledgeBaseAssignments)
      .where(
        and(
          eq(schema.agentKnowledgeBaseAssignments.organizationId, organizationId),
          eq(schema.agentKnowledgeBaseAssignments.agentId, agentId),
        ),
      );
    if (!knowledgeBaseIds.length) return;
    const bases = await transaction.query.knowledgeBases.findMany({
      where: and(
        eq(schema.knowledgeBases.organizationId, organizationId),
        inArray(schema.knowledgeBases.id, knowledgeBaseIds),
      ),
    });
    for (const base of bases) {
      await transaction.insert(schema.agentKnowledgeBaseAssignments).values({
        organizationId,
        agentId,
        knowledgeBaseId: base.id,
      });
    }
  }

  private async resolveActiveConfig(actor: RequestActor, item: typeof schema.agents.$inferSelect): Promise<AgentConfig | null> {
    const organizationId = this.organization(actor);
    if (item.publishedVersionId) {
      const published = await this.database.db.query.agentVersions.findFirst({
        where: and(
          eq(schema.agentVersions.organizationId, organizationId),
          eq(schema.agentVersions.id, item.publishedVersionId),
        ),
      });
      return published?.config ?? null;
    }
    const latest = await this.database.db.query.agentVersions.findFirst({
      where: and(eq(schema.agentVersions.organizationId, organizationId), eq(schema.agentVersions.agentId, item.id)),
      orderBy: [desc(schema.agentVersions.version)],
    });
    return latest?.config ?? null;
  }

  private async version(actor: RequestActor, id: string) {
    const item = await this.database.db.query.agentVersions.findFirst({
      where: and(
        eq(schema.agentVersions.organizationId, this.organization(actor)),
        eq(schema.agentVersions.id, id),
      ),
    });
    if (!item) throw new ApiException({ code: 'AGENT_VERSION_NOT_FOUND', message: 'Agent version was not found.', status: 404 });
    return {
      id: item.id,
      agentId: item.agentId,
      version: item.version,
      status: item.status,
      config: item.config,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private async find(actor: RequestActor, id: string) {
    const item = await this.database.db.query.agents.findFirst({
      where: and(eq(schema.agents.organizationId, this.organization(actor)), eq(schema.agents.id, id)),
    });
    if (!item) throw new ApiException({ code: 'AGENT_NOT_FOUND', message: 'Agent was not found.', status: 404 });
    return item;
  }

  private validateConfig(config: AgentConfig, publishing: boolean): void {
    const route = config.routingPolicy;
    if (route.pipelineMode === 'controlled') {
      const sttProvider = route.sttProvider ?? 'openai';
      const ttsProvider = route.ttsProvider ?? 'elevenlabs';
      if (route.mode === 'real' && !route.sttLanguage) {
        throw new ApiException({
          code: 'STT_CONFIGURATION_REQUIRED',
          message: 'Select sr, hr, bs, or multi before publishing a real controlled pipeline.',
          status: 422,
        });
      }
      if (publishing && route.mode === 'real') {
        const required = [
          'openai',
          ...(sttProvider === 'deepgram' ? ['deepgram'] : []),
          ...(ttsProvider === 'elevenlabs' ? ['elevenlabs'] : []),
        ];
        const missing = required.filter((provider) => !route.allowedProviders.includes(provider));
        if (missing.length) {
          throw new ApiException({
            code: 'CONTROLLED_PIPELINE_INCOMPLETE',
            message: 'The controlled pipeline is missing one or more selected providers.',
            status: 422,
            details: { missing },
          });
        }
      }
    } else if (route.pipelineMode === 'direct_realtime') {
      if (route.mode === 'real' && !route.allowedProviders.includes('openai-realtime')) {
        throw new ApiException({
          code: 'REALTIME_PIPELINE_INCOMPLETE',
          message: 'Direct realtime mode requires the OpenAI realtime provider.',
          status: 422,
        });
      }
    } else {
      throw new ApiException({ code: 'PIPELINE_MODE_INVALID', message: 'Unknown pipeline mode.', status: 422 });
    }
  }

  private organization(actor: RequestActor): string {
    if (!actor.organizationId) throw new ApiException({ code: 'ORGANIZATION_REQUIRED', message: 'Select an organization.', status: 400 });
    return actor.organizationId;
  }

  private formatAgent(item: typeof schema.agents.$inferSelect) {
    return {
      id: item.id,
      organizationId: item.organizationId,
      name: item.name,
      slug: item.slug,
      description: item.description,
      language: 'cnr' as const,
      publishedVersionId: item.publishedVersionId,
      archivedAt: item.archivedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
