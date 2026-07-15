import { createHash } from 'node:crypto';
import { hostname } from 'node:os';

import type { Database } from '@montenegrina/database';
import { schema } from '@montenegrina/database';
import { chunkSections, flattenParserSections } from '@montenegrina/knowledge-core';
import type { ProviderRequestContext } from '@montenegrina/provider-core';
import type { ProviderSet } from '@montenegrina/providers';
import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { batchValues } from './batching.js';
import { KnowledgeParserClient } from './knowledge-parser.js';
import type { ObjectStorage } from './storage.js';

const SECTION_INSERT_BATCH_SIZE = 100;
const CHUNK_INSERT_BATCH_SIZE = 25;

export class DocumentProcessor {
  constructor(
    private readonly database: Database,
    private readonly storage: ObjectStorage,
    private readonly providers: ProviderSet,
    private readonly parser = new KnowledgeParserClient(),
  ) {}

  async process(data: Record<string, unknown>): Promise<void> {
    const documentId = String(data.documentId);
    const versionId = String(data.documentVersionId);
    const ingestionJobId =
      typeof data.ingestionJobId === 'string' && data.ingestionJobId.length > 0
        ? data.ingestionJobId
        : undefined;
    const version = await this.database.query.documentVersions.findFirst({
      where: and(
        eq(schema.documentVersions.id, versionId),
        eq(schema.documentVersions.documentId, documentId),
      ),
    });
    const document = await this.database.query.documents.findFirst({
      where: eq(schema.documents.id, documentId),
    });
    if (!version || !document || !version.objectKey) throw new Error('DOCUMENT_VERSION_NOT_FOUND');

    const updateJob = async (
      stage: typeof schema.ingestionJobs.$inferSelect.stage,
      progressPercent: number,
      status: typeof schema.ingestionJobs.$inferSelect.status = 'RUNNING',
      error?: { code: string; details?: string },
    ) => {
      if (!ingestionJobId) return;
      await this.database
        .update(schema.ingestionJobs)
        .set({
          stage,
          progressPercent,
          status,
          workerId: hostname(),
          ...(status === 'RUNNING' && progressPercent <= 5 ? { startedAt: new Date() } : {}),
          ...(status === 'COMPLETED'
            ? { completedAt: new Date(), errorCode: null, errorDetails: null }
            : {}),
          ...(status === 'FAILED'
            ? {
                completedAt: new Date(),
                errorCode: error?.code ?? 'INGESTION_FAILED',
                errorDetails: error?.details?.slice(0, 4000) ?? null,
              }
            : {}),
        })
        .where(eq(schema.ingestionJobs.id, ingestionJobId));
    };

    await this.database
      .update(schema.documents)
      .set({ status: 'PROCESSING', updatedAt: new Date() })
      .where(eq(schema.documents.id, documentId));
    await updateJob('DOWNLOADING', 5);

    try {
      const bytes = await this.storage.get(version.objectKey);
      if (bytes.byteLength !== version.byteSize) throw new Error('DOCUMENT_SIZE_MISMATCH');
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== version.sha256) throw new Error('DOCUMENT_DIGEST_MISMATCH');

      await updateJob('PARSING', 20);
      const parsed = await this.parser.parse(bytes, version.mediaType);
      const sections = flattenParserSections(parsed.sections);
      await updateJob('CHUNKING', 45);
      const documentChunks = chunkSections(sections);
      if (!documentChunks.length) throw new Error('DOCUMENT_EMPTY');

      await updateJob('EMBEDDING', 60);
      const context: ProviderRequestContext = {
        requestId: uuidv7(),
        traceId: digest.slice(0, 32),
        organizationId: document.organizationId,
        timeoutMs: 60_000,
        dataPolicy: {
          allowedProviders: [this.providers.embeddings.id],
          allowedRegions: ['local', 'global', 'eu'],
          allowFallback: false,
        },
      };
      const vectors: number[][] = [];
      for (let offset = 0; offset < documentChunks.length; offset += 20) {
        const batch = documentChunks.slice(offset, offset + 20);
        const response = await this.providers.embeddings.embed(
          { texts: batch.map((chunk) => chunk.content) },
          context,
        );
        vectors.push(...response.data);
      }

      await updateJob('INDEXING', 85);
      const sectionIds = sections.map(() => uuidv7());
      const sectionRows = sections.map((section, index) => ({
        id: sectionIds[index] as string,
        organizationId: document.organizationId,
        documentId,
        documentVersionId: versionId,
        parentSectionId:
          section.parentOrdinal === undefined ? null : (sectionIds[section.parentOrdinal] ?? null),
        ordinal: section.ordinal,
        heading: section.heading,
        level: section.level,
        pageStart: section.pageStart,
        pageEnd: section.pageEnd,
        articleNumber: section.articleNumber,
        content: section.content,
        metadata: section.metadata ?? {},
      }));
      const chunkRows = documentChunks.map((chunk, index) => ({
        id: uuidv7(),
        organizationId: document.organizationId,
        documentId,
        documentVersionId: versionId,
        sectionId:
          chunk.sectionOrdinal === undefined ? null : (sectionIds[chunk.sectionOrdinal] ?? null),
        ordinal: chunk.ordinal,
        page: chunk.page,
        section: chunk.section,
        articleNumber: chunk.articleNumber,
        headingPath: chunk.headingPath,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        embedding: vectors[index] as number[],
        searchText: chunk.searchText,
      }));
      await this.database.transaction(async (transaction) => {
        await transaction
          .delete(schema.documentSections)
          .where(eq(schema.documentSections.documentVersionId, versionId));
        await transaction
          .delete(schema.documentChunks)
          .where(eq(schema.documentChunks.documentVersionId, versionId));
        for (const batch of batchValues(sectionRows, SECTION_INSERT_BATCH_SIZE)) {
          await transaction.insert(schema.documentSections).values(batch);
        }
        for (const batch of batchValues(chunkRows, CHUNK_INSERT_BATCH_SIZE)) {
          await transaction.insert(schema.documentChunks).values(batch);
        }
        await transaction
          .update(schema.documentVersions)
          .set({
            extractedText: parsed.extractedText,
            pageCount: parsed.pageCount ?? null,
            parserVersion: parsed.parserVersion,
            structureJson: { sectionCount: sections.length, chunkCount: documentChunks.length },
          })
          .where(eq(schema.documentVersions.id, versionId));
        await transaction
          .update(schema.documents)
          .set({
            status: 'READY',
            sha256: digest,
            errorCode: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.documents.id, documentId));
      });
      await this.database.insert(schema.outboxEvents).values({
        id: uuidv7(),
        organizationId: document.organizationId,
        type: 'document.ready',
        aggregateId: documentId,
        payload: {
          organizationId: document.organizationId,
          documentId,
          knowledgeBaseId: document.knowledgeBaseId,
          status: 'READY',
        },
      });
      await updateJob('COMPLETED', 100, 'COMPLETED');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DOCUMENT_PROCESSING_FAILED';
      await this.database
        .update(schema.documents)
        .set({
          status: 'FAILED',
          errorCode: message.slice(0, 100),
          updatedAt: new Date(),
        })
        .where(eq(schema.documents.id, documentId));
      await updateJob('FAILED', 100, 'FAILED', { code: message.slice(0, 100), details: message });
      throw error;
    }
  }
}
