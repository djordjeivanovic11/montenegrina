import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { LiveKitVoiceService } from '../livekit/livekit-voice.service.js';
import { VoiceAgentServiceGuard } from '../livekit/voice-agent-service.guard.js';
import { Public } from '../security/public.decorator.js';
import type { RequestActor } from '../security/actor.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { InternalGuard } from '../internal/internal.guard.js';
import { RetrievalService } from '../knowledge/retrieval.service.js';
import { ToolsService } from '../tools/tools.service.js';
import { MneMcpService } from '../integrations/mne-mcp.service.js';
import type { RealtimeEvent } from '@montenegrina/contracts';

@Public()
@Controller('internal/v1/runtime')
export class InternalController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly retrieval: RetrievalService,
    private readonly tools: ToolsService,
    private readonly livekitVoice: LiveKitVoiceService,
    private readonly mneMcp: MneMcpService,
  ) {}

  @UseGuards(InternalGuard)
  @Get('bootstrap')
  async bootstrap(@Req() request: FastifyRequest) {
    const claims = request.runtimeClaims as NonNullable<FastifyRequest['runtimeClaims']>;
    const [runtime, tools] = await Promise.all([
      this.conversations.bootstrap(claims),
      this.tools.runtimeDefinitions(claims),
    ]);
    return { ...runtime, tools };
  }

  @UseGuards(VoiceAgentServiceGuard)
  @Post('provision-inbound')
  provisionInbound(
    @Body()
    body: {
      roomName: string;
      calledNumber: string;
      callerNumber: string;
      sipCallId?: string;
      phoneNumberId?: string;
    },
  ) {
    return this.livekitVoice.provisionInbound(body);
  }

  @UseGuards(InternalGuard)
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

  @UseGuards(InternalGuard)
  @Post('retrieve')
  async retrieve(
    @Req() request: FastifyRequest,
    @Body() body: { query: string; topK?: number; mneMcpEnabled?: boolean },
  ) {
    const claims = request.runtimeClaims as NonNullable<FastifyRequest['runtimeClaims']>;
    const actor: RequestActor = {
      actorType: 'SERVICE',
      actorId: claims.conversationId,
      organizationId: claims.organizationId,
      permissions: new Set(['knowledge:read']),
    };
    const [local, mne] = await Promise.all([
      this.retrieval.retrieveForAgent(actor, claims.agentId, body.query, {
        topK: Math.min(body.topK ?? 4, 4),
        conversationId: claims.conversationId,
      }),
      this.mneMcp.retrieve(body.query, {
        requested: body.mneMcpEnabled === true,
        limit: 4,
      }),
    ]);
    return {
      items: [...local.slice(0, 4), ...mne.items.slice(0, 4)].slice(0, 8),
      mneMcp: {
        enabled: body.mneMcpEnabled === true,
        status: mne.status,
        latencyMs: mne.latencyMs,
        cacheHit: mne.cacheHit,
        ...(mne.route ? { route: mne.route } : {}),
        ...(mne.mode ? { mode: mne.mode } : {}),
      },
    };
  }

  @UseGuards(InternalGuard)
  @Post('tools/invoke')
  invokeTool(
    @Req() request: FastifyRequest,
    @Body() body: { name: string; input: Record<string, unknown>; idempotencyKey?: string },
  ) {
    const claims = request.runtimeClaims as NonNullable<FastifyRequest['runtimeClaims']>;
    return this.tools.invoke(claims, body.name, body.input, body.idempotencyKey);
  }
}
