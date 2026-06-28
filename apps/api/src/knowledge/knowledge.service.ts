import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { schema } from '@montenegrina/database';
import type { ProviderRequestContext } from '@montenegrina/provider-core';
import type { ProviderSet } from '@montenegrina/providers';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { fileTypeFromBuffer } from 'file-type';
import { v7 as uuidv7 } from 'uuid';

import { AgentsService } from '../agents/agents.service.js';
import { ApiException } from '../core/api-exception.js';
import { PROVIDERS } from '../core/tokens.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';
import { SafeWebFetcher } from './safe-web-fetcher.js';

const allowedMediaTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);

export interface RetrievalCitation {
  documentId: string;
  documentVersionId: string;
  chunkId: string;
  title: string;
  page?: number;
  section?: string;
  score: number;
  content: string;
}

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStorageService,
    private readonly fetcher: SafeWebFetcher,
    private readonly agents: AgentsService,
    @Inject(PROVIDERS) private readonly providers: ProviderSet,
  ) {}

  async list(actor: RequestActor) {
    const items = await this.database.db.query.documents.findMany({
      where: and(
        eq(schema.documents.organizationId, this.organization(actor)),
        isNull(schema.documents.deletedAt),
      ),
      orderBy: [desc(schema.documents.createdAt)],
    });
    return { items: items.map((item) => this.format(item)) };
  }

  async createFile(options: {
    actor: RequestActor;
    agentId: string;
    title: string;
    bytes: Uint8Array;
    declaredMediaType: string;
  }) {
    if (options.bytes.byteLength > 25 * 1024 * 1024) {
      throw new ApiException({ code: 'DOCUMENT_TOO_LARGE', message: 'Documents may not exceed 25 MiB.', status: 413 });
    }
    const detected = await fileTypeFromBuffer(options.bytes);
    const mediaType = detected?.mime ?? options.declaredMediaType.split(';')[0];
    if (!mediaType || !allowedMediaTypes.has(mediaType)) {
      throw new ApiException({ code: 'DOCUMENT_TYPE_REJECTED', message: 'The document type is not supported.', status: 422 });
    }
    return this.create({
      actor: options.actor,
      agentId: options.agentId,
      title: options.title,
      bytes: options.bytes,
      mediaType,
    });
  }

  async createText(options: {
    actor: RequestActor;
    agentId: string;
    title: string;
    text?: string;
    sourceUrl?: string;
  }) {
    if (!options.text && !options.sourceUrl) {
      throw new ApiException({ code: 'DOCUMENT_CONTENT_REQUIRED', message: 'Text or a source URL is required.' });
    }
    const fetched = options.sourceUrl ? await this.fetcher.fetchText(options.sourceUrl) : undefined;
    const text = options.text ?? fetched?.text ?? '';
    return this.create({
      actor: options.actor,
      agentId: options.agentId,
      title: options.title,
      bytes: new TextEncoder().encode(text),
      mediaType: 'text/plain',
      ...(fetched?.finalUrl || options.sourceUrl
        ? { sourceUrl: fetched?.finalUrl ?? (options.sourceUrl as string) }
        : {}),
    });
  }

  async delete(actor: RequestActor, documentId: string) {
    const organizationId = this.organization(actor);
    const document = await this.database.db.query.documents.findFirst({
      where: and(eq(schema.documents.organizationId, organizationId), eq(schema.documents.id, documentId)),
    });
    if (!document) throw new ApiException({ code: 'DOCUMENT_NOT_FOUND', message: 'Document was not found.', status: 404 });
    const versions = await this.database.db.query.documentVersions.findMany({
      where: eq(schema.documentVersions.documentId, documentId),
    });
    const id = uuidv7();
    await this.database.db.transaction(async (transaction) => {
      await transaction
        .update(schema.documents)
        .set({ status: 'DELETING', deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.documents.id, documentId));
      await transaction.insert(schema.deletionJobs).values({
        id,
        organizationId,
        resourceType: 'document',
        resourceId: documentId,
        objectKeys: versions.flatMap((version) => (version.objectKey ? [version.objectKey] : [])),
      });
      await transaction.insert(schema.outboxEvents).values({
        id: uuidv7(),
        organizationId,
        type: 'document.delete',
        aggregateId: documentId,
        payload: { deletionJobId: id },
      });
    });
    return { id, status: 'QUEUED' };
  }

  async retrieve(
    actor: RequestActor,
    agentId: string,
    query: string,
    topK = 8,
  ): Promise<RetrievalCitation[]> {
    const organizationId = this.organization(actor);
    await this.agents.published(actor, agentId);
    const context: ProviderRequestContext = {
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
    const embedded = await this.providers.embeddings.embed({ texts: [query] }, context);
    const vector = embedded.data[0];
    if (!vector) return [];
    const vectorLiteral = `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`;
    const result = await this.database.db.execute<{
      document_id: string;
      document_version_id: string;
      chunk_id: string;
      title: string;
      page: number | null;
      section: string | null;
      content: string;
      score: number;
    }>(sql`
      WITH candidates AS (
        SELECT
          dc.document_id,
          dc.document_version_id,
          dc.id AS chunk_id,
          d.title,
          dc.page,
          dc.section,
          dc.content,
          row_number() OVER (ORDER BY dc.embedding <=> ${vectorLiteral}::vector) AS vector_rank,
          row_number() OVER (
            ORDER BY ts_rank_cd(to_tsvector('simple', dc.search_text), plainto_tsquery('simple', ${query})) DESC
          ) AS lexical_rank
        FROM document_chunks dc
        JOIN documents d ON d.id = dc.document_id AND d.organization_id = dc.organization_id
        JOIN knowledge_sources ks ON ks.id = d.knowledge_source_id AND ks.organization_id = d.organization_id
        WHERE dc.organization_id = ${organizationId}
          AND ks.agent_id = ${agentId}
          AND d.status = 'READY'
          AND d.deleted_at IS NULL
          AND dc.embedding IS NOT NULL
        ORDER BY dc.embedding <=> ${vectorLiteral}::vector
        LIMIT 40
      )
      SELECT *, (1.0 / (60 + vector_rank) + 1.0 / (60 + lexical_rank))::float8 AS score
      FROM candidates
      ORDER BY score DESC
      LIMIT ${Math.max(1, Math.min(20, topK))}
    `);
    return result.rows.map((row) => ({
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      chunkId: row.chunk_id,
      title: row.title,
      ...(row.page ? { page: row.page } : {}),
      ...(row.section ? { section: row.section } : {}),
      score: row.score,
      content: row.content,
    }));
  }

  private async create(options: {
    actor: RequestActor;
    agentId: string;
    title: string;
    bytes: Uint8Array;
    mediaType: string;
    sourceUrl?: string;
  }) {
    const organizationId = this.organization(options.actor);
    await this.agents.published(options.actor, options.agentId);
    let source = await this.database.db.query.knowledgeSources.findFirst({
      where: and(
        eq(schema.knowledgeSources.organizationId, organizationId),
        eq(schema.knowledgeSources.agentId, options.agentId),
      ),
    });
    if (!source) {
      const id = uuidv7();
      await this.database.db.insert(schema.knowledgeSources).values({
        id,
        organizationId,
        agentId: options.agentId,
        name: 'Default knowledge source',
      });
      source = await this.database.db.query.knowledgeSources.findFirst({
        where: eq(schema.knowledgeSources.id, id),
      });
    }
    const documentId = uuidv7();
    const versionId = uuidv7();
    const digest = createHash('sha256').update(options.bytes).digest('hex');
    const objectKey = `organizations/${organizationId}/documents/${documentId}/1/${digest}`;
    await this.storage.put(objectKey, options.bytes, options.mediaType);
    await this.database.db.transaction(async (transaction) => {
      await transaction.insert(schema.documents).values({
        id: documentId,
        organizationId,
        knowledgeSourceId: source?.id as string,
        title: options.title,
        status: 'UPLOADED',
        currentVersion: 1,
        sourceUrl: options.sourceUrl,
      });
      await transaction.insert(schema.documentVersions).values({
        id: versionId,
        organizationId,
        documentId,
        version: 1,
        objectKey,
        mediaType: options.mediaType,
        byteSize: options.bytes.byteLength,
        sha256: digest,
      });
      await transaction.insert(schema.outboxEvents).values({
        id: uuidv7(),
        organizationId,
        type: 'document.ingest',
        aggregateId: documentId,
        payload: { documentId, documentVersionId: versionId, objectKey },
      });
    });
    const document = await this.database.db.query.documents.findFirst({ where: eq(schema.documents.id, documentId) });
    return this.format(document as typeof schema.documents.$inferSelect);
  }

  private organization(actor: RequestActor): string {
    if (!actor.organizationId) throw new ApiException({ code: 'ORGANIZATION_REQUIRED', message: 'Select an organization.', status: 400 });
    return actor.organizationId;
  }

  private format(item: typeof schema.documents.$inferSelect) {
    return {
      id: item.id,
      title: item.title,
      status: item.status,
      version: item.currentVersion,
      errorCode: item.errorCode,
      createdAt: item.createdAt.toISOString(),
    };
  }
}
