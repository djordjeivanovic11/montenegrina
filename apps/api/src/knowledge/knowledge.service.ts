import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { schema } from '@montenegrina/database';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { fileTypeFromBuffer } from 'file-type';
import { v7 as uuidv7 } from 'uuid';

import { AuditService } from '../audit/audit.service.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { ApiException } from '../core/api-exception.js';
import { ENVIRONMENT } from '../core/tokens.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';
import { SafeWebFetcher } from './safe-web-fetcher.js';

const allowedMediaTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'text/html',
  'application/xhtml+xml',
]);

export interface DocumentMetadataInput {
  title?: string;
  documentType?: string;
  language?: string;
  ministryDepartment?: string;
  publicationDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  sourceUrl?: string;
  visibility?: 'ORG' | 'ROLE_RESTRICTED' | 'GROUP_RESTRICTED';
  minimumRole?: 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';
  accessGroupIds?: string[];
}

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStorageService,
    private readonly fetcher: SafeWebFetcher,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  async list(actor: RequestActor, knowledgeBaseId?: string) {
    const organizationId = this.organization(actor);
    const items = await this.database.db.query.documents.findMany({
      where: knowledgeBaseId
        ? and(
            eq(schema.documents.organizationId, organizationId),
            isNull(schema.documents.deletedAt),
            eq(schema.documents.knowledgeBaseId, knowledgeBaseId),
          )
        : and(
            eq(schema.documents.organizationId, organizationId),
            isNull(schema.documents.deletedAt),
          ),
      orderBy: [desc(schema.documents.createdAt)],
    });
    return { items: items.map((item) => this.format(item)) };
  }

  async get(actor: RequestActor, documentId: string) {
    const document = await this.requireDocument(actor, documentId);
    const versions = await this.database.db.query.documentVersions.findMany({
      where: eq(schema.documentVersions.documentId, documentId),
      orderBy: [desc(schema.documentVersions.version)],
    });
    const groups = await this.database.db.query.documentAccessGroups.findMany({
      where: and(
        eq(schema.documentAccessGroups.organizationId, document.organizationId),
        eq(schema.documentAccessGroups.documentId, documentId),
      ),
    });
    return {
      ...this.format(document),
      ministryDepartment: document.ministryDepartment,
      language: document.language,
      documentType: document.documentType,
      publicationDate: document.publicationDate?.toISOString() ?? null,
      effectiveFrom: document.effectiveFrom?.toISOString() ?? null,
      effectiveTo: document.effectiveTo?.toISOString() ?? null,
      sourceUrl: document.sourceUrl,
      visibility: document.visibility,
      minimumRole: document.minimumRole,
      accessGroupIds: groups.map((group) => group.accessGroupId),
      versions: versions.map((version) => ({
        id: version.id,
        version: version.version,
        mediaType: version.mediaType,
        byteSize: version.byteSize,
        sha256: version.sha256,
        pageCount: version.pageCount,
        parserVersion: version.parserVersion,
        createdAt: version.createdAt.toISOString(),
      })),
    };
  }

  async createFile(options: {
    actor: RequestActor;
    knowledgeBaseId: string;
    title: string;
    bytes: Uint8Array;
    declaredMediaType: string;
    metadata?: DocumentMetadataInput;
    requestId: string;
  }) {
    if (options.bytes.byteLength > this.environment.KNOWLEDGE_MAX_DOCUMENT_MIB * 1024 * 1024) {
      throw new ApiException({
        code: 'DOCUMENT_TOO_LARGE',
        message: `Documents may not exceed ${this.environment.KNOWLEDGE_MAX_DOCUMENT_MIB} MiB.`,
        status: 413,
      });
    }
    const detected = await fileTypeFromBuffer(options.bytes);
    const mediaType = detected?.mime ?? options.declaredMediaType.split(';')[0];
    if (!mediaType || !allowedMediaTypes.has(mediaType)) {
      throw new ApiException({
        code: 'DOCUMENT_TYPE_REJECTED',
        message: 'The document type is not supported.',
        status: 422,
      });
    }
    return this.createDocument({
      ...options,
      bytes: options.bytes,
      mediaType,
    });
  }

  async createText(options: {
    actor: RequestActor;
    knowledgeBaseId: string;
    title: string;
    text?: string;
    sourceUrl?: string;
    metadata?: DocumentMetadataInput;
    requestId: string;
  }) {
    if (!options.text && !options.sourceUrl) {
      throw new ApiException({
        code: 'DOCUMENT_CONTENT_REQUIRED',
        message: 'Text or a source URL is required.',
      });
    }
    const fetched = options.sourceUrl ? await this.fetcher.fetchText(options.sourceUrl) : undefined;
    const text = options.text ?? fetched?.text ?? '';
    return this.createDocument({
      actor: options.actor,
      knowledgeBaseId: options.knowledgeBaseId,
      title: options.title,
      bytes: new TextEncoder().encode(text),
      mediaType: 'text/plain',
      metadata: {
        ...(options.metadata ?? {}),
        ...(fetched?.finalUrl || options.sourceUrl
          ? { sourceUrl: fetched?.finalUrl ?? options.sourceUrl }
          : {}),
      },
      requestId: options.requestId,
    });
  }

  async bulkUpload(options: {
    actor: RequestActor;
    knowledgeBaseId: string;
    files: Array<{ title: string; bytes: Uint8Array; declaredMediaType: string }>;
    requestId: string;
  }) {
    if (options.files.length > this.environment.KNOWLEDGE_MAX_BULK_FILES) {
      throw new ApiException({
        code: 'BULK_UPLOAD_LIMIT',
        message: `At most ${this.environment.KNOWLEDGE_MAX_BULK_FILES} files may be uploaded at once.`,
        status: 422,
      });
    }
    const totalBytes = options.files.reduce((total, file) => total + file.bytes.byteLength, 0);
    if (totalBytes > this.environment.KNOWLEDGE_MAX_BULK_MIB * 1024 * 1024) {
      throw new ApiException({
        code: 'BULK_UPLOAD_TOO_LARGE',
        message: `A bulk upload may not exceed ${this.environment.KNOWLEDGE_MAX_BULK_MIB} MiB.`,
        status: 413,
      });
    }
    const organizationId = this.organization(options.actor);
    await this.entitlements.assertWithinLimit(organizationId, 'DOCUMENTS', options.files.length);
    const items = [];
    for (const file of options.files) {
      items.push(
        await this.createFile({
          actor: options.actor,
          knowledgeBaseId: options.knowledgeBaseId,
          title: file.title,
          bytes: file.bytes,
          declaredMediaType: file.declaredMediaType,
          requestId: options.requestId,
        }),
      );
    }
    return { items };
  }

  async updateMetadata(
    actor: RequestActor,
    documentId: string,
    metadata: Record<string, unknown>,
    requestId: string,
  ) {
    const parsed = metadata as DocumentMetadataInput;
    const document = await this.requireDocument(actor, documentId);
    await this.database.db
      .update(schema.documents)
      .set({
        ...(parsed.title ? { title: parsed.title } : {}),
        ...(parsed.documentType ? { documentType: parsed.documentType } : {}),
        ...(parsed.language ? { language: parsed.language } : {}),
        ...(parsed.ministryDepartment !== undefined
          ? { ministryDepartment: parsed.ministryDepartment }
          : {}),
        ...(parsed.publicationDate ? { publicationDate: new Date(parsed.publicationDate) } : {}),
        ...(parsed.effectiveFrom ? { effectiveFrom: new Date(parsed.effectiveFrom) } : {}),
        ...(parsed.effectiveTo ? { effectiveTo: new Date(parsed.effectiveTo) } : {}),
        ...(parsed.sourceUrl !== undefined ? { sourceUrl: parsed.sourceUrl } : {}),
        ...(parsed.visibility ? { visibility: parsed.visibility } : {}),
        ...(parsed.minimumRole ? { minimumRole: parsed.minimumRole } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.documents.id, documentId));
    if (parsed.accessGroupIds) {
      await this.database.db
        .delete(schema.documentAccessGroups)
        .where(
          and(
            eq(schema.documentAccessGroups.organizationId, document.organizationId),
            eq(schema.documentAccessGroups.documentId, documentId),
          ),
        );
      if (parsed.accessGroupIds.length) {
        await this.database.db.insert(schema.documentAccessGroups).values(
          parsed.accessGroupIds.map((accessGroupId) => ({
            organizationId: document.organizationId,
            documentId,
            accessGroupId,
          })),
        );
      }
    }
    await this.audit.record({
      actor,
      action: 'document.updated',
      resourceType: 'document',
      resourceId: documentId,
      requestId,
      before: this.format(document),
      after: { ...metadata },
    });
    return this.get(actor, documentId);
  }

  async preview(actor: RequestActor, documentId: string) {
    const document = await this.requireDocument(actor, documentId);
    const version = await this.database.db.query.documentVersions.findFirst({
      where: and(
        eq(schema.documentVersions.documentId, documentId),
        eq(schema.documentVersions.version, document.currentVersion),
      ),
    });
    if (!version)
      throw new ApiException({
        code: 'DOCUMENT_VERSION_NOT_FOUND',
        message: 'Document version was not found.',
        status: 404,
      });
    const sections = await this.database.db.query.documentSections.findMany({
      where: eq(schema.documentSections.documentVersionId, version.id),
      orderBy: [asc(schema.documentSections.ordinal)],
    });
    return {
      documentId,
      version: version.version,
      mediaType: version.mediaType,
      extractedText: version.extractedText,
      sections: sections.map((section) => ({
        id: section.id,
        heading: section.heading,
        level: section.level,
        pageStart: section.pageStart,
        pageEnd: section.pageEnd,
        articleNumber: section.articleNumber,
        content: section.content,
      })),
    };
  }

  async content(actor: RequestActor, documentId: string) {
    const document = await this.requireDocument(actor, documentId);
    const version = await this.database.db.query.documentVersions.findFirst({
      where: and(
        eq(schema.documentVersions.documentId, documentId),
        eq(schema.documentVersions.version, document.currentVersion),
      ),
    });
    if (!version?.objectKey) {
      throw new ApiException({
        code: 'DOCUMENT_VERSION_NOT_FOUND',
        message: 'Document version was not found.',
        status: 404,
      });
    }
    const object = await this.storage.get(version.objectKey);
    return { body: object.body, contentType: version.mediaType || object.contentType };
  }

  async getIngestionJob(actor: RequestActor, jobId: string) {
    const organizationId = this.organization(actor);
    const job = await this.database.db.query.ingestionJobs.findFirst({
      where: and(
        eq(schema.ingestionJobs.organizationId, organizationId),
        eq(schema.ingestionJobs.id, jobId),
      ),
    });
    if (!job)
      throw new ApiException({
        code: 'INGESTION_JOB_NOT_FOUND',
        message: 'Ingestion job was not found.',
        status: 404,
      });
    return {
      id: job.id,
      documentId: job.documentId,
      documentVersionId: job.documentVersionId,
      status: job.status,
      stage: job.stage,
      progressPercent: job.progressPercent,
      errorCode: job.errorCode,
      errorDetails: job.errorDetails,
      attempts: job.attempts,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
    };
  }

  async reindex(actor: RequestActor, documentId: string, requestId: string) {
    const document = await this.requireDocument(actor, documentId);
    const version = await this.database.db.query.documentVersions.findFirst({
      where: and(
        eq(schema.documentVersions.documentId, documentId),
        eq(schema.documentVersions.version, document.currentVersion),
      ),
    });
    if (!version?.objectKey) {
      throw new ApiException({
        code: 'DOCUMENT_VERSION_NOT_FOUND',
        message: 'Document version was not found.',
        status: 404,
      });
    }
    let ingestionJobId: string | undefined;
    let existingJobId: string | undefined;
    await this.database.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${documentId}, 0))`,
      );
      const existingJob = await transaction.query.ingestionJobs.findFirst({
        where: and(
          eq(schema.ingestionJobs.documentId, documentId),
          eq(schema.ingestionJobs.documentVersionId, version.id),
          inArray(schema.ingestionJobs.status, ['QUEUED', 'RUNNING']),
        ),
        orderBy: [desc(schema.ingestionJobs.createdAt)],
      });
      if (existingJob) {
        existingJobId = existingJob.id;
        return;
      }
      ingestionJobId = uuidv7();
      await transaction
        .update(schema.documents)
        .set({ status: 'UPLOADED', errorCode: null, updatedAt: new Date() })
        .where(eq(schema.documents.id, documentId));
      await transaction.insert(schema.ingestionJobs).values({
        id: ingestionJobId,
        organizationId: document.organizationId,
        documentId,
        documentVersionId: version.id,
      });
      await transaction.insert(schema.outboxEvents).values({
        id: uuidv7(),
        organizationId: document.organizationId,
        type: 'document.ingest',
        aggregateId: documentId,
        payload: {
          documentId,
          documentVersionId: version.id,
          ingestionJobId,
          objectKey: version.objectKey,
        },
      });
    });
    if (existingJobId) {
      return { ...(await this.getIngestionJob(actor, existingJobId)), deduplicated: true };
    }
    if (!ingestionJobId) {
      throw new ApiException({
        code: 'REINDEX_FAILED',
        message: 'Could not queue document reindex.',
        status: 500,
      });
    }
    await this.audit.record({
      actor,
      action: 'document.reindex_requested',
      resourceType: 'document',
      resourceId: documentId,
      requestId,
    });
    return this.getIngestionJob(actor, ingestionJobId);
  }

  async delete(actor: RequestActor, documentId: string, requestId: string) {
    const organizationId = this.organization(actor);
    const document = await this.requireDocument(actor, documentId);
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
    await this.audit.record({
      actor,
      action: 'document.deleted',
      resourceType: 'document',
      resourceId: documentId,
      requestId,
      before: this.format(document),
    });
    return { id, status: 'QUEUED' };
  }

  private async createDocument(options: {
    actor: RequestActor;
    knowledgeBaseId: string;
    title: string;
    bytes: Uint8Array;
    mediaType: string;
    metadata?: DocumentMetadataInput;
    requestId: string;
  }) {
    const organizationId = this.organization(options.actor);
    await this.requireKnowledgeBase(organizationId, options.knowledgeBaseId);
    const digest = createHash('sha256').update(options.bytes).digest('hex');
    const duplicate = await this.database.db.query.documents.findFirst({
      where: and(
        eq(schema.documents.organizationId, organizationId),
        eq(schema.documents.knowledgeBaseId, options.knowledgeBaseId),
        eq(schema.documents.sha256, digest),
        isNull(schema.documents.deletedAt),
      ),
    });
    if (duplicate) {
      return { ...this.format(duplicate), duplicate: true };
    }

    await this.entitlements.assertWithinLimit(organizationId, 'DOCUMENTS', 1);

    const documentId = uuidv7();
    const versionId = uuidv7();
    const ingestionJobId = uuidv7();
    const objectKey = `organizations/${organizationId}/documents/${documentId}/1/${digest}`;
    await this.storage.put(objectKey, options.bytes, options.mediaType);
    await this.database.db.transaction(async (transaction) => {
      await transaction.insert(schema.documents).values({
        id: documentId,
        organizationId,
        knowledgeBaseId: options.knowledgeBaseId,
        title: options.metadata?.title ?? options.title,
        documentType: options.metadata?.documentType ?? 'general',
        language: options.metadata?.language ?? 'cnr',
        ministryDepartment: options.metadata?.ministryDepartment,
        publicationDate: options.metadata?.publicationDate
          ? new Date(options.metadata.publicationDate)
          : undefined,
        effectiveFrom: options.metadata?.effectiveFrom
          ? new Date(options.metadata.effectiveFrom)
          : undefined,
        effectiveTo: options.metadata?.effectiveTo
          ? new Date(options.metadata.effectiveTo)
          : undefined,
        sourceUrl: options.metadata?.sourceUrl,
        visibility: options.metadata?.visibility ?? 'ORG',
        minimumRole: options.metadata?.minimumRole,
        status: 'UPLOADED',
        currentVersion: 1,
        sha256: digest,
        createdByUserId: options.actor.userId,
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
        sourceUrl: options.metadata?.sourceUrl,
      });
      if (options.metadata?.accessGroupIds?.length) {
        await transaction.insert(schema.documentAccessGroups).values(
          options.metadata.accessGroupIds.map((accessGroupId) => ({
            organizationId,
            documentId,
            accessGroupId,
          })),
        );
      }
      await transaction.insert(schema.ingestionJobs).values({
        id: ingestionJobId,
        organizationId,
        documentId,
        documentVersionId: versionId,
      });
      await transaction.insert(schema.outboxEvents).values({
        id: uuidv7(),
        organizationId,
        type: 'document.ingest',
        aggregateId: documentId,
        payload: {
          documentId,
          documentVersionId: versionId,
          ingestionJobId,
          objectKey,
        },
      });
    });
    await this.audit.record({
      actor: options.actor,
      action: 'document.created',
      resourceType: 'document',
      resourceId: documentId,
      requestId: options.requestId,
      after: { title: options.title, knowledgeBaseId: options.knowledgeBaseId },
    });
    const document = await this.database.db.query.documents.findFirst({
      where: eq(schema.documents.id, documentId),
    });
    return { ...this.format(document as typeof schema.documents.$inferSelect), ingestionJobId };
  }

  private async requireKnowledgeBase(organizationId: string, knowledgeBaseId: string) {
    const base = await this.database.db.query.knowledgeBases.findFirst({
      where: and(
        eq(schema.knowledgeBases.organizationId, organizationId),
        eq(schema.knowledgeBases.id, knowledgeBaseId),
      ),
    });
    if (!base)
      throw new ApiException({
        code: 'KNOWLEDGE_BASE_NOT_FOUND',
        message: 'Knowledge base was not found.',
        status: 404,
      });
    return base;
  }

  private async requireDocument(actor: RequestActor, documentId: string) {
    const organizationId = this.organization(actor);
    const document = await this.database.db.query.documents.findFirst({
      where: and(
        eq(schema.documents.organizationId, organizationId),
        eq(schema.documents.id, documentId),
        isNull(schema.documents.deletedAt),
      ),
    });
    if (!document)
      throw new ApiException({
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document was not found.',
        status: 404,
      });
    return document;
  }

  private organization(actor: RequestActor): string {
    if (!actor.organizationId)
      throw new ApiException({
        code: 'ORGANIZATION_REQUIRED',
        message: 'Select an organization.',
        status: 400,
      });
    return actor.organizationId;
  }

  private format(item: typeof schema.documents.$inferSelect) {
    return {
      id: item.id,
      knowledgeBaseId: item.knowledgeBaseId,
      title: item.title,
      status: item.status,
      version: item.currentVersion,
      documentType: item.documentType,
      language: item.language,
      errorCode: item.errorCode,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
