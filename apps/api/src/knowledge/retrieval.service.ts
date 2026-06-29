import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { schema } from '@montenegrina/database';
import {
  buildKnowledgePromptBlock,
  canAccessDocument,
  deduplicateCandidates,
  diversifyCandidatesByDocument,
  mergeRetrievalScores,
  reciprocalRankFusion,
  type AccessContext,
  type DocumentAccess,
  type MembershipRole,
  type RetrievalCandidate,
} from '@montenegrina/knowledge-core';
import type { ProviderRequestContext } from '@montenegrina/provider-core';
import type { ProviderSet } from '@montenegrina/providers';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { v7 as uuidv7 } from 'uuid';

import { AgentsService } from '../agents/agents.service.js';
import { ApiException } from '../core/api-exception.js';
import { ENVIRONMENT, PROVIDERS, REDIS } from '../core/tokens.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';
import { KnowledgeParserClient } from './knowledge-parser.client.js';

export interface GroundedContext extends RetrievalCandidate {
  sourceUrl?: string | null;
}

@Injectable()
export class RetrievalService {
  constructor(
    private readonly database: DatabaseService,
    private readonly agents: AgentsService,
    private readonly parser: KnowledgeParserClient,
    @Inject(PROVIDERS) private readonly providers: ProviderSet,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  buildPromptBlock(sources: GroundedContext[]): string {
    return buildKnowledgePromptBlock(sources);
  }

  async retrieveForAgent(
    actor: RequestActor,
    agentId: string,
    query: string,
    options: { topK?: number; conversationId?: string; testMode?: boolean; knowledgeBaseId?: string } = {},
  ): Promise<GroundedContext[]> {
    const topK = Math.max(1, Math.min(20, options.topK ?? 8));
    const organizationId = this.organization(actor);
    const { version } = await this.agents.published(actor, agentId);
    const configuredIds =
      version.config.knowledgeBaseIds?.length
        ? version.config.knowledgeBaseIds
        : (version.config.knowledgeSourceIds ?? []);
    const knowledgeBaseIds = await this.resolveKnowledgeBaseIds(
      organizationId,
      agentId,
      configuredIds,
      options,
    );
    if (!knowledgeBaseIds.length) return [];

    const cacheKey = `knowledge:retrieve:${organizationId}:${agentId}:${createHash('sha256').update(`${query}:${knowledgeBaseIds.join(',')}`).digest('hex')}`;
    if (!options.testMode && this.environment.KNOWLEDGE_RETRIEVAL_CACHE_TTL_SECONDS > 0) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as GroundedContext[];
    }

    const started = Date.now();
    const accessContext = await this.accessContext(actor, organizationId);
    const embedded = await this.providers.embeddings.embed(
      { texts: [query] },
      this.embeddingContext(organizationId, agentId, query),
    );
    const vector = embedded.data[0];
    if (!vector) return [];
    const vectorLiteral = `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`;

    const result = await this.database.db.execute<{
      chunk_id: string;
      document_id: string;
      document_version_id: string;
      section_id: string | null;
      title: string;
      document_type: string;
      language: string;
      version: number;
      page: number | null;
      section: string | null;
      article_number: string | null;
      heading_path: string | null;
      source_url: string | null;
      content: string;
      visibility: 'ORG' | 'ROLE_RESTRICTED' | 'GROUP_RESTRICTED';
      minimum_role: MembershipRole | null;
      vector_rank: number;
      lexical_rank: number;
      vector_score: number;
      lexical_score: number;
    }>(sql`
      WITH scoped AS (
        SELECT
          dc.id AS chunk_id,
          dc.document_id,
          dc.document_version_id,
          dc.section_id,
          d.title,
          d.document_type,
          d.language,
          d.current_version AS version,
          dc.page,
          dc.section,
          dc.article_number,
          dc.heading_path,
          COALESCE(dv.source_url, d.source_url) AS source_url,
          dc.content,
          d.visibility,
          d.minimum_role,
          row_number() OVER (ORDER BY dc.embedding <=> ${vectorLiteral}::vector) AS vector_rank,
          ts_rank_cd(
            to_tsvector('simple', dc.search_text),
            plainto_tsquery('simple', ${query})
          ) AS lexical_score,
          row_number() OVER (
            ORDER BY ts_rank_cd(
              to_tsvector('simple', dc.search_text),
              plainto_tsquery('simple', ${query})
            ) DESC
          ) AS lexical_rank
        FROM document_chunks dc
        JOIN documents d ON d.id = dc.document_id AND d.organization_id = dc.organization_id
        JOIN document_versions dv ON dv.id = dc.document_version_id AND dv.organization_id = dc.organization_id
        JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id AND kb.organization_id = d.organization_id
        WHERE dc.organization_id = ${organizationId}
          AND d.knowledge_base_id IN (${sql.join(knowledgeBaseIds.map((id) => sql`${id}`), sql`, `)})
          AND kb.enabled = true
          AND d.status = 'READY'
          AND d.deleted_at IS NULL
          AND dv.version = d.current_version
          AND dc.embedding IS NOT NULL
        ORDER BY dc.embedding <=> ${vectorLiteral}::vector
        LIMIT 40
      )
      SELECT
        *,
        (1.0 / (60 + vector_rank))::float8 AS vector_score
      FROM scoped
      ORDER BY (1.0 / (60 + vector_rank) + 1.0 / (60 + lexical_rank)) DESC
      LIMIT 20
    `);

    const documentAccess = await this.documentAccessMap(
      organizationId,
      result.rows.map((row) => row.document_id),
    );

    const filtered = result.rows.filter((row) =>
      canAccessDocument(accessContext, documentAccess.get(row.document_id) ?? { visibility: 'ORG', accessGroupIds: [] }),
    );

    const candidates: RetrievalCandidate[] = filtered.map((row) => {
      const rrfScore = reciprocalRankFusion(row.vector_rank, row.lexical_rank, row.vector_score, row.lexical_score);
      return {
        chunkId: row.chunk_id,
        documentId: row.document_id,
        documentVersionId: row.document_version_id,
        sectionId: row.section_id,
        title: row.title,
        documentType: row.document_type,
        language: row.language,
        version: row.version,
        page: row.page,
        section: row.section,
        articleNumber: row.article_number,
        headingPath: row.heading_path,
        sourceUrl: row.source_url,
        content: row.content,
        vectorScore: row.vector_score,
        lexicalScore: row.lexical_score,
        rrfScore,
        finalScore: rrfScore,
      };
    });

    const rerankScores = await this.parser.rerank(
      query,
      candidates.map((candidate) => candidate.content),
    );
    const merged = mergeRetrievalScores(
      candidates.map((candidate, index) => ({
        ...candidate,
        rerankScore: rerankScores[index] ?? candidate.rrfScore,
      })),
    );
    const deduped = diversifyCandidatesByDocument(deduplicateCandidates(merged), topK);

    await this.database.db.insert(schema.retrievalEvents).values({
      id: uuidv7(),
      organizationId,
      agentId,
      conversationId: options.conversationId,
      query,
      knowledgeBaseIds,
      resultCount: deduped.length,
      latencyMs: Date.now() - started,
      chunkIds: deduped.map((item) => item.chunkId),
      scores: {
        candidates: deduped.map((item) => ({
          chunkId: item.chunkId,
          vectorScore: item.vectorScore,
          lexicalScore: item.lexicalScore,
          rrfScore: item.rrfScore,
          rerankScore: item.rerankScore,
          finalScore: item.finalScore,
        })),
      },
    });

    if (!options.testMode && this.environment.KNOWLEDGE_RETRIEVAL_CACHE_TTL_SECONDS > 0) {
      await this.redis.set(
        cacheKey,
        JSON.stringify(deduped),
        'EX',
        this.environment.KNOWLEDGE_RETRIEVAL_CACHE_TTL_SECONDS,
      );
    }

    return deduped;
  }

  private async resolveKnowledgeBaseIds(
    organizationId: string,
    agentId: string,
    configuredIds: string[],
    options: { testMode?: boolean; knowledgeBaseId?: string },
  ): Promise<string[]> {
    if (options.testMode && options.knowledgeBaseId) {
      const base = await this.database.db.query.knowledgeBases.findFirst({
        where: and(
          eq(schema.knowledgeBases.organizationId, organizationId),
          eq(schema.knowledgeBases.id, options.knowledgeBaseId),
          eq(schema.knowledgeBases.enabled, true),
        ),
      });
      return base ? [base.id] : [];
    }

    if (!configuredIds.length) return [];

    const assignments = await this.database.db.query.agentKnowledgeBaseAssignments.findMany({
      where: and(
        eq(schema.agentKnowledgeBaseAssignments.organizationId, organizationId),
        eq(schema.agentKnowledgeBaseAssignments.agentId, agentId),
        inArray(schema.agentKnowledgeBaseAssignments.knowledgeBaseId, configuredIds),
      ),
    });
    if (assignments.length) {
      return assignments.map((item) => item.knowledgeBaseId);
    }

    const bases = await this.database.db.query.knowledgeBases.findMany({
      where: and(
        eq(schema.knowledgeBases.organizationId, organizationId),
        inArray(schema.knowledgeBases.id, configuredIds),
        eq(schema.knowledgeBases.enabled, true),
      ),
    });
    return bases.map((base) => base.id);
  }

  private async documentAccessMap(
    organizationId: string,
    documentIds: string[],
  ): Promise<Map<string, DocumentAccess>> {
    if (!documentIds.length) return new Map();
    const documents = await this.database.db.query.documents.findMany({
      where: and(
        eq(schema.documents.organizationId, organizationId),
        inArray(schema.documents.id, documentIds),
      ),
    });
    const groups = await this.database.db.query.documentAccessGroups.findMany({
      where: and(
        eq(schema.documentAccessGroups.organizationId, organizationId),
        inArray(schema.documentAccessGroups.documentId, documentIds),
      ),
    });
    const groupMap = new Map<string, string[]>();
    for (const group of groups) {
      const current = groupMap.get(group.documentId) ?? [];
      current.push(group.accessGroupId);
      groupMap.set(group.documentId, current);
    }
    return new Map(
      documents.map((document) => [
        document.id,
        {
          visibility: document.visibility,
          minimumRole: document.minimumRole,
          accessGroupIds: groupMap.get(document.id) ?? [],
        },
      ]),
    );
  }

  private async accessContext(actor: RequestActor, organizationId: string): Promise<AccessContext> {
    if (actor.actorType !== 'USER' || !actor.userId) {
      return { actorType: actor.actorType, accessGroupIds: new Set() };
    }
    const membership = await this.database.db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.organizationId, organizationId),
        eq(schema.memberships.userId, actor.userId),
      ),
    });
    const groups = await this.database.db.query.accessGroupMemberships.findMany({
      where: and(
        eq(schema.accessGroupMemberships.organizationId, organizationId),
        eq(schema.accessGroupMemberships.userId, actor.userId),
      ),
    });
    return {
      actorType: actor.actorType,
      ...(membership?.role ? { membershipRole: membership.role } : {}),
      accessGroupIds: new Set(groups.map((group) => group.accessGroupId)),
    };
  }

  private embeddingContext(
    organizationId: string,
    agentId: string,
    query: string,
  ): ProviderRequestContext {
    return {
      requestId: uuidv7(),
      traceId: createHash('sha256').update(query).digest('hex').slice(0, 32),
      organizationId,
      agentId,
      timeoutMs: 30_000,
      dataPolicy: {
        allowedProviders: [this.providers.embeddings.id],
        allowedRegions: ['local', 'global', 'eu'],
        allowFallback: false,
      },
    };
  }

  private organization(actor: RequestActor): string {
    if (!actor.organizationId) {
      throw new ApiException({ code: 'ORGANIZATION_REQUIRED', message: 'Select an organization.', status: 400 });
    }
    return actor.organizationId;
  }
}
