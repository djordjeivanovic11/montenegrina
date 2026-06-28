import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { AgentConfigurationSnapshot } from '@montenegrina/database/schema';

import type { RequestActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.decorator.js';
import { RequirePermissions } from '../security/permissions.decorator.js';
import { AgentsService } from './agents.service.js';

@Controller('v1/agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  @RequirePermissions('agents:read')
  list(
    @CurrentActor() actor: RequestActor,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.agents.list(actor, cursor, limit ? Number(limit) : 20);
  }

  @Post()
  @RequirePermissions('agents:create')
  create(
    @CurrentActor() actor: RequestActor,
    @Body() body: { name: string; slug: string; description?: string },
  ) {
    return this.agents.create(actor, body);
  }

  @Get(':agentId')
  @RequirePermissions('agents:read')
  get(@CurrentActor() actor: RequestActor, @Param('agentId') id: string) {
    return this.agents.get(actor, id);
  }

  @Patch(':agentId')
  @RequirePermissions('agents:update')
  update(
    @CurrentActor() actor: RequestActor,
    @Param('agentId') id: string,
    @Body() body: { name?: string; description?: string },
  ) {
    return this.agents.update(actor, id, body);
  }

  @Post(':agentId/versions')
  @RequirePermissions('agents:update')
  createVersion(
    @CurrentActor() actor: RequestActor,
    @Param('agentId') id: string,
    @Body() body: { config: AgentConfigurationSnapshot },
  ) {
    return this.agents.createVersion(actor, id, body.config);
  }

  @Post(':agentId/publish')
  @RequirePermissions('agents:publish')
  publish(
    @CurrentActor() actor: RequestActor,
    @Param('agentId') id: string,
    @Body() body: { versionId: string },
  ) {
    return this.agents.publish(actor, id, body.versionId);
  }
}

