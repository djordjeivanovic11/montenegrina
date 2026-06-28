import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { RealtimeEvent } from '@montenegrina/contracts';
import type { FastifyRequest } from 'fastify';

import { ConversationsService } from '../conversations/conversations.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { Public } from '../security/public.decorator.js';
import type { RequestActor } from '../security/actor.js';
import { ToolsService } from '../tools/tools.service.js';
import { InternalGuard } from './internal.guard.js';

@Public()
@UseGuards(InternalGuard)
@Controller('internal/v1/runtime')
export class InternalController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly knowledge: KnowledgeService,
    private readonly tools: ToolsService,
  ) {}

  @Get('bootstrap')
  async bootstrap(@Req() request: FastifyRequest) {
    const claims = request.runtimeClaims as NonNullable<FastifyRequest['runtimeClaims']>;
    const [runtime, tools] = await Promise.all([
      this.conversations.bootstrap(claims),
      this.tools.runtimeDefinitions(claims),
    ]);
    return { ...runtime, tools };
  }

  @Post('events/batch')
  events(@Req() request: FastifyRequest, @Body() body: { events: RealtimeEvent[] }) {
    const claims = request.runtimeClaims as NonNullable<FastifyRequest['runtimeClaims']>;
    if (
      body.events.some(
        (event) =>
          event.organizationId !== claims.organizationId ||
          event.agentId !== claims.agentId ||
          event.conversationId !== claims.conversationId,
      )
    ) {
      throw new Error('Runtime event scope mismatch');
    }
    return this.conversations.appendRuntimeEvents(body.events);
  }

  @Post('retrieve')
  retrieve(
    @Req() request: FastifyRequest,
    @Body() body: { query: string; topK?: number },
  ) {
    const claims = request.runtimeClaims as NonNullable<FastifyRequest['runtimeClaims']>;
    const actor: RequestActor = {
      actorType: 'SERVICE',
      actorId: claims.conversationId,
      organizationId: claims.organizationId,
      permissions: new Set(['knowledge:read']),
    };
    return this.knowledge.retrieve(actor, claims.agentId, body.query, body.topK ?? 8);
  }

  @Post('tools/invoke')
  invokeTool(
    @Req() request: FastifyRequest,
    @Body() body: { name: string; input: Record<string, unknown>; idempotencyKey?: string },
  ) {
    const claims = request.runtimeClaims as NonNullable<FastifyRequest['runtimeClaims']>;
    return this.tools.invoke(claims, body.name, body.input, body.idempotencyKey);
  }
}
