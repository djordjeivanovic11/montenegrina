import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { v7 as uuidv7 } from 'uuid';

import { ApiException } from '../core/api-exception.js';
import { ENVIRONMENT } from '../core/tokens.js';
import type { RequestActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.decorator.js';
import { RequirePermissions } from '../security/permissions.decorator.js';
import { AccessGroupsService } from './access-groups.service.js';
import { KnowledgeBasesService } from './knowledge-bases.service.js';
import { KnowledgeService } from './knowledge.service.js';
import { RetrievalService } from './retrieval.service.js';

function fieldValue(fields: Record<string, unknown>, name: string): string | undefined {
  const field = fields[name] as { value?: unknown } | undefined;
  return typeof field?.value === 'string' ? field.value : undefined;
}

function requestId(request: FastifyRequest): string {
  return (request.headers['x-request-id'] as string | undefined) ?? uuidv7();
}

@Controller('v1/knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly bases: KnowledgeBasesService,
    private readonly accessGroups: AccessGroupsService,
    private readonly retrieval: RetrievalService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  @Get('bases')
  @RequirePermissions('knowledge:read')
  listBases(@CurrentActor() actor: RequestActor) {
    return this.bases.list(actor);
  }

  @Post('bases')
  @RequirePermissions('knowledge:create')
  createBase(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Body() body: { name: string; slug: string; description?: string; defaultLanguage?: string },
  ) {
    return this.bases.create(actor, body, requestId(request));
  }

  @Patch('bases/:knowledgeBaseId')
  @RequirePermissions('knowledge:update')
  updateBase(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Param('knowledgeBaseId') id: string,
    @Body()
    body: Partial<{ name: string; description: string; defaultLanguage: string; enabled: boolean }>,
  ) {
    return this.bases.update(actor, id, body, requestId(request));
  }

  @Delete('bases/:knowledgeBaseId')
  @RequirePermissions('knowledge:delete')
  deleteBase(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Param('knowledgeBaseId') id: string,
  ) {
    return this.bases.delete(actor, id, requestId(request));
  }

  @Get('bases/:knowledgeBaseId/assignments')
  @RequirePermissions('knowledge:read')
  listAssignments(@CurrentActor() actor: RequestActor, @Param('knowledgeBaseId') id: string) {
    return this.bases.listAssignments(actor, id);
  }

  @Post('bases/:knowledgeBaseId/assignments')
  @RequirePermissions('knowledge:update')
  assignBase(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Param('knowledgeBaseId') id: string,
    @Body() body: { agentId: string },
  ) {
    return this.bases.assign(actor, id, body.agentId, requestId(request));
  }

  @Delete('bases/:knowledgeBaseId/assignments/:agentId')
  @RequirePermissions('knowledge:update')
  unassignBase(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Param('knowledgeBaseId') id: string,
    @Param('agentId') agentId: string,
  ) {
    return this.bases.unassign(actor, id, agentId, requestId(request));
  }

  @Get('access-groups')
  @RequirePermissions('knowledge:read')
  listAccessGroups(@CurrentActor() actor: RequestActor) {
    return this.accessGroups.list(actor);
  }

  @Post('access-groups')
  @RequirePermissions('knowledge:update')
  createAccessGroup(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Body() body: { name: string; slug: string; description?: string },
  ) {
    return this.accessGroups.create(actor, body, requestId(request));
  }

  @Post('access-groups/:accessGroupId/members')
  @RequirePermissions('knowledge:update')
  addAccessGroupMember(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Param('accessGroupId') accessGroupId: string,
    @Body() body: { userId: string },
  ) {
    return this.accessGroups.addMember(actor, accessGroupId, body.userId, requestId(request));
  }

  @Delete('access-groups/:accessGroupId/members/:userId')
  @RequirePermissions('knowledge:update')
  removeAccessGroupMember(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Param('accessGroupId') accessGroupId: string,
    @Param('userId') userId: string,
  ) {
    return this.accessGroups.removeMember(actor, accessGroupId, userId, requestId(request));
  }

  @Get('documents')
  @RequirePermissions('knowledge:read')
  listDocuments(@CurrentActor() actor: RequestActor, @Req() request: FastifyRequest) {
    const knowledgeBaseId = (request.query as { knowledgeBaseId?: string }).knowledgeBaseId;
    return this.knowledge.list(actor, knowledgeBaseId);
  }

  @Get('documents/:documentId')
  @RequirePermissions('knowledge:read')
  getDocument(@CurrentActor() actor: RequestActor, @Param('documentId') id: string) {
    return this.knowledge.get(actor, id);
  }

  @Get('documents/:documentId/preview')
  @RequirePermissions('knowledge:read')
  previewDocument(@CurrentActor() actor: RequestActor, @Param('documentId') id: string) {
    return this.knowledge.preview(actor, id);
  }

  @Get('documents/:documentId/content')
  @RequirePermissions('knowledge:read')
  async documentContent(
    @CurrentActor() actor: RequestActor,
    @Param('documentId') id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { body, contentType } = await this.knowledge.content(actor, id);
    await reply.header('Content-Type', contentType).send(Buffer.from(body));
  }

  @Patch('documents/:documentId')
  @RequirePermissions('knowledge:update')
  updateDocument(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Param('documentId') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.knowledge.updateMetadata(actor, id, body, requestId(request));
  }

  @Post('documents/:documentId/reindex')
  @RequirePermissions('knowledge:update')
  reindexDocument(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Param('documentId') id: string,
  ) {
    return this.knowledge.reindex(actor, id, requestId(request));
  }

  @Get('ingestion-jobs/:jobId')
  @RequirePermissions('knowledge:read')
  getIngestionJob(@CurrentActor() actor: RequestActor, @Param('jobId') jobId: string) {
    return this.knowledge.getIngestionJob(actor, jobId);
  }

  @Post('documents/bulk')
  @RequirePermissions('knowledge:create')
  async bulkUpload(@CurrentActor() actor: RequestActor, @Req() request: FastifyRequest) {
    if (!request.isMultipart()) {
      throw new ApiException({
        code: 'MULTIPART_REQUIRED',
        message: 'Bulk upload requires multipart form data.',
      });
    }
    const parts = request.files({
      limits: {
        fileSize: this.environment.KNOWLEDGE_MAX_DOCUMENT_MIB * 1024 * 1024,
        files: this.environment.KNOWLEDGE_MAX_BULK_FILES,
      },
    });
    const files: Array<{ title: string; bytes: Uint8Array; declaredMediaType: string }> = [];
    let knowledgeBaseId = '';
    let totalBytes = 0;
    for await (const part of parts) {
      if (part.type === 'file') {
        const fields = part.fields as Record<string, unknown>;
        const title = fieldValue(fields, 'title') ?? part.filename ?? 'Dokument';
        if (!knowledgeBaseId) knowledgeBaseId = fieldValue(fields, 'knowledgeBaseId') ?? '';
        const bytes = await part.toBuffer();
        totalBytes += bytes.byteLength;
        if (totalBytes > this.environment.KNOWLEDGE_MAX_BULK_MIB * 1024 * 1024) {
          throw new ApiException({
            code: 'BULK_UPLOAD_TOO_LARGE',
            message: `A bulk upload may not exceed ${this.environment.KNOWLEDGE_MAX_BULK_MIB} MiB.`,
            status: 413,
          });
        }
        files.push({
          title,
          bytes,
          declaredMediaType: part.mimetype,
        });
      }
    }
    if (!knowledgeBaseId) {
      throw new ApiException({
        code: 'KNOWLEDGE_BASE_REQUIRED',
        message: 'knowledgeBaseId is required.',
      });
    }
    return this.knowledge.bulkUpload({
      actor,
      knowledgeBaseId,
      files,
      requestId: requestId(request),
    });
  }

  @Post('documents')
  @RequirePermissions('knowledge:create')
  async createDocument(@CurrentActor() actor: RequestActor, @Req() request: FastifyRequest) {
    const id = requestId(request);
    if (request.isMultipart()) {
      const file = await request.file({
        limits: { fileSize: this.environment.KNOWLEDGE_MAX_DOCUMENT_MIB * 1024 * 1024, files: 1 },
      });
      if (!file)
        throw new ApiException({
          code: 'DOCUMENT_REQUIRED',
          message: 'A document file is required.',
        });
      const fields = file.fields as Record<string, unknown>;
      const knowledgeBaseId = fieldValue(fields, 'knowledgeBaseId');
      const title = fieldValue(fields, 'title');
      if (!knowledgeBaseId || !title) {
        throw new ApiException({
          code: 'DOCUMENT_METADATA_REQUIRED',
          message: 'knowledgeBaseId and title are required.',
        });
      }
      return this.knowledge.createFile({
        actor,
        knowledgeBaseId,
        title,
        bytes: await file.toBuffer(),
        declaredMediaType: file.mimetype,
        requestId: id,
      });
    }
    const body = request.body as {
      knowledgeBaseId?: string;
      title?: string;
      text?: string;
      sourceUrl?: string;
    };
    if (!body.knowledgeBaseId || !body.title) {
      throw new ApiException({
        code: 'DOCUMENT_METADATA_REQUIRED',
        message: 'knowledgeBaseId and title are required.',
      });
    }
    return this.knowledge.createText({
      actor,
      knowledgeBaseId: body.knowledgeBaseId,
      title: body.title,
      ...(body.text ? { text: body.text } : {}),
      ...(body.sourceUrl ? { sourceUrl: body.sourceUrl } : {}),
      requestId: id,
    });
  }

  @Delete('documents/:documentId')
  @RequirePermissions('knowledge:delete')
  deleteDocument(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Param('documentId') id: string,
  ) {
    return this.knowledge.delete(actor, id, requestId(request));
  }

  @Post('retrieve/test')
  @RequirePermissions('knowledge:read')
  async testRetrieval(
    @CurrentActor() actor: RequestActor,
    @Body() body: { agentId: string; query: string; topK?: number; knowledgeBaseId?: string },
  ) {
    const results = await this.retrieval.retrieveForAgent(actor, body.agentId, body.query, {
      topK: body.topK ?? 8,
      testMode: true,
      ...(body.knowledgeBaseId ? { knowledgeBaseId: body.knowledgeBaseId } : {}),
    });
    return {
      query: body.query,
      context: this.retrieval.buildPromptBlock(results),
      results: results.map((result) => ({
        chunkId: result.chunkId,
        documentId: result.documentId,
        title: result.title,
        page: result.page,
        section: result.section,
        articleNumber: result.articleNumber,
        headingPath: result.headingPath,
        sourceUrl: result.sourceUrl,
        content: result.content,
        vectorScore: result.vectorScore,
        lexicalScore: result.lexicalScore,
        rrfScore: result.rrfScore,
        rerankScore: result.rerankScore,
        finalScore: result.finalScore,
      })),
    };
  }
}
