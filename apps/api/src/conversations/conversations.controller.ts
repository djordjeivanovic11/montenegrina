import { Body, Controller, Delete, Get, Headers, Param, Post, Sse } from '@nestjs/common';

import { ConversationsService } from './conversations.service.js';
import type { RequestActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.decorator.js';
import { RequirePermissions } from '../security/permissions.decorator.js';

@Controller('v1')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post('conversations')
  @RequirePermissions('conversations:create')
  create(
    @CurrentActor() actor: RequestActor,
    @Body() body: { agentId: string; channel: 'TEXT' | 'BROWSER' | 'SIP' | 'BATCH' },
  ) {
    return this.conversations.create(actor, body.agentId, body.channel);
  }

  @Get('conversations/:conversationId')
  @RequirePermissions('conversations:read')
  get(@CurrentActor() actor: RequestActor, @Param('conversationId') id: string) {
    return this.conversations.get(actor, id);
  }

  @Get('conversations/:conversationId/transcript')
  @RequirePermissions('conversations:read')
  transcript(@CurrentActor() actor: RequestActor, @Param('conversationId') id: string) {
    return this.conversations.transcript(actor, id);
  }

  @Sse('conversations/:conversationId/events')
  @RequirePermissions('conversations:read')
  events(
    @CurrentActor() actor: RequestActor,
    @Param('conversationId') id: string,
    @Headers('last-event-id') lastEventId?: string,
  ) {
    return this.conversations.stream(actor, id, Number(lastEventId ?? 0));
  }

  @Delete('conversations/:conversationId')
  @RequirePermissions('conversations:delete')
  delete(@CurrentActor() actor: RequestActor, @Param('conversationId') id: string) {
    return this.conversations.delete(actor, id);
  }

  @Post('conversations/:conversationId/handoff')
  @RequirePermissions('conversations:update')
  handoff(
    @CurrentActor() actor: RequestActor,
    @Param('conversationId') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.conversations.handoff(actor, id, body.reason ?? 'Zahtjev korisnika');
  }

  @Get('conversations/:conversationId/recording')
  @RequirePermissions('conversations:read')
  recording(@CurrentActor() actor: RequestActor, @Param('conversationId') id: string) {
    return this.conversations.recordingUrl(actor, id);
  }

  @Post('agents/:agentId/realtime-sessions')
  @RequirePermissions('conversations:create')
  realtime(
    @CurrentActor() actor: RequestActor,
    @Param('agentId') agentId: string,
    @Body() body: { participantName?: string },
  ) {
    return this.conversations.realtimeSession(actor, agentId, body.participantName);
  }

  @Post('agents/:agentId/calls')
  @RequirePermissions('conversations:create')
  call(
    @CurrentActor() actor: RequestActor,
    @Param('agentId') agentId: string,
    @Body() body: { to: string },
  ) {
    return this.conversations.call(actor, agentId, body.to);
  }
}

