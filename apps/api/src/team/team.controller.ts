import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { v7 as uuidv7 } from 'uuid';

import type { RequestActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.decorator.js';
import { RequirePermissions } from '../security/permissions.decorator.js';
import { InvitationsService } from './invitations.service.js';

function requestId(request: FastifyRequest): string {
  return (request.headers['x-request-id'] as string | undefined) ?? uuidv7();
}

@Controller('v1/team')
export class TeamController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get('members')
  @RequirePermissions('memberships:read')
  listMembers(@CurrentActor() actor: RequestActor) {
    return this.invitations.listMembers(actor);
  }

  @Get('invitations')
  @RequirePermissions('memberships:read')
  listInvitations(@CurrentActor() actor: RequestActor) {
    return this.invitations.list(actor);
  }

  @Post('invitations')
  @RequirePermissions('memberships:create')
  createInvitation(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Body() body: { email: string; role?: 'ADMIN' | 'DEVELOPER' | 'VIEWER' },
  ) {
    return this.invitations.create(actor, body, requestId(request));
  }

  @Delete('invitations/:invitationId')
  @RequirePermissions('memberships:create')
  revokeInvitation(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitations.revoke(actor, invitationId, requestId(request));
  }

  @Patch('members/:userId')
  @RequirePermissions('memberships:create')
  updateMember(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Param('userId') userId: string,
    @Body() body: { role: 'ADMIN' | 'DEVELOPER' | 'VIEWER' },
  ) {
    return this.invitations.updateMemberRole(actor, userId, body.role, requestId(request));
  }

  @Delete('members/:userId')
  @RequirePermissions('memberships:create')
  removeMember(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Param('userId') userId: string,
  ) {
    return this.invitations.removeMember(actor, userId, requestId(request));
  }

  @Post('invitations/accept')
  acceptInvitation(@CurrentActor() actor: RequestActor, @Body() body: { token: string }) {
    return this.invitations.accept(body.token, actor.userId as string);
  }
}
