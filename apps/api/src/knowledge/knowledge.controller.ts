import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { ApiException } from '../core/api-exception.js';
import type { RequestActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.decorator.js';
import { RequirePermissions } from '../security/permissions.decorator.js';
import { KnowledgeService } from './knowledge.service.js';

function fieldValue(fields: Record<string, unknown>, name: string): string | undefined {
  const field = fields[name] as { value?: unknown } | undefined;
  return typeof field?.value === 'string' ? field.value : undefined;
}

@Controller('v1/knowledge/documents')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  @RequirePermissions('knowledge:read')
  list(@CurrentActor() actor: RequestActor) {
    return this.knowledge.list(actor);
  }

  @Post()
  @RequirePermissions('knowledge:create')
  async create(@CurrentActor() actor: RequestActor, @Req() request: FastifyRequest) {
    if (request.isMultipart()) {
      const file = await request.file({ limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
      if (!file) throw new ApiException({ code: 'DOCUMENT_REQUIRED', message: 'A document file is required.' });
      const fields = file.fields as Record<string, unknown>;
      const agentId = fieldValue(fields, 'agentId');
      const title = fieldValue(fields, 'title');
      if (!agentId || !title) throw new ApiException({ code: 'DOCUMENT_METADATA_REQUIRED', message: 'agentId and title are required.' });
      return this.knowledge.createFile({
        actor,
        agentId,
        title,
        bytes: await file.toBuffer(),
        declaredMediaType: file.mimetype,
      });
    }
    const body = request.body as { agentId?: string; title?: string; text?: string; sourceUrl?: string };
    if (!body.agentId || !body.title) throw new ApiException({ code: 'DOCUMENT_METADATA_REQUIRED', message: 'agentId and title are required.' });
    return this.knowledge.createText({
      actor,
      agentId: body.agentId,
      title: body.title,
      ...(body.text ? { text: body.text } : {}),
      ...(body.sourceUrl ? { sourceUrl: body.sourceUrl } : {}),
    });
  }

  @Delete(':documentId')
  @RequirePermissions('knowledge:delete')
  delete(@CurrentActor() actor: RequestActor, @Param('documentId') id: string) {
    return this.knowledge.delete(actor, id);
  }
}
