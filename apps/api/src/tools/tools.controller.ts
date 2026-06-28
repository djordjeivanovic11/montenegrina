import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import type { RequestActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.decorator.js';
import { RequirePermissions } from '../security/permissions.decorator.js';
import { ToolsService } from './tools.service.js';

type ToolBody = Parameters<ToolsService['create']>[1];

@Controller('v1')
export class ToolsController {
  constructor(private readonly tools: ToolsService) {}

  @Get('tools')
  @RequirePermissions('tools:read')
  list(@CurrentActor() actor: RequestActor) {
    return this.tools.list(actor);
  }

  @Post('tools')
  @RequirePermissions('tools:create')
  create(@CurrentActor() actor: RequestActor, @Body() body: ToolBody) {
    return this.tools.create(actor, body);
  }

  @Patch('tools/:toolId')
  @RequirePermissions('tools:update')
  update(
    @CurrentActor() actor: RequestActor,
    @Param('toolId') id: string,
    @Body() body: ToolBody,
  ) {
    return this.tools.update(actor, id, body);
  }

  @Post('conversations/:conversationId/tool-invocations/:invocationId/confirm')
  @RequirePermissions('conversations:update')
  confirm(
    @CurrentActor() actor: RequestActor,
    @Param('conversationId') conversationId: string,
    @Param('invocationId') invocationId: string,
    @Body() body: { confirmed: boolean; confirmationText: string },
  ) {
    return this.tools.confirm(actor, conversationId, invocationId, body.confirmed, body.confirmationText);
  }
}

