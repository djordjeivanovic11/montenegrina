import { Body, Controller, Delete, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';
import { schema } from '@montenegrina/database';

import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../core/api-exception.js';
import { ENVIRONMENT } from '../core/tokens.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.decorator.js';
import { RequirePermissions } from '../security/permissions.decorator.js';

function requestId(request: FastifyRequest): string {
  return (request.headers['x-request-id'] as string | undefined) ?? uuidv7();
}

@Controller('v1/integrations')
export class IntegrationsController {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  @Get('channels')
  @RequirePermissions('agents:read')
  async listChannels(@CurrentActor() actor: RequestActor) {
    const organizationId = actor.organizationId as string;
    const items = await this.database.db.query.communicationChannels.findMany({
      where: eq(schema.communicationChannels.organizationId, organizationId),
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        name: item.name,
        status: item.status,
        phoneIntegrationsEnabled: this.environment.PHONE_INTEGRATIONS_ENABLED,
      })),
    };
  }

  @Get('webhooks')
  @RequirePermissions('api-keys:read')
  async listWebhooks(@CurrentActor() actor: RequestActor) {
    if (!this.environment.WEBHOOKS_ENABLED) {
      return { items: [], enabled: false };
    }
    const items = await this.database.db.query.webhookEndpoints.findMany({
      where: eq(schema.webhookEndpoints.organizationId, actor.organizationId as string),
    });
    return {
      enabled: true,
      items: items.map((item) => ({
        id: item.id,
        url: item.url,
        events: item.events,
        enabled: item.enabled,
        lastDeliveryAt: item.lastDeliveryAt?.toISOString() ?? null,
      })),
    };
  }

  @Post('webhooks')
  @RequirePermissions('api-keys:create')
  async createWebhook(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Body() body: { url: string; events: string[] },
  ) {
    if (!this.environment.WEBHOOKS_ENABLED) {
      throw new ApiException({ code: 'WEBHOOKS_DISABLED', message: 'Webhooks are disabled.', status: 403 });
    }
    const secret = randomBytes(32).toString('base64url');
    const id = uuidv7();
    await this.database.db.insert(schema.webhookEndpoints).values({
      id,
      organizationId: actor.organizationId as string,
      url: body.url,
      events: body.events,
      secretHash: await argon2.hash(secret, { type: argon2.argon2id }),
    });
    await this.audit.record({
      actor,
      action: 'webhook.created',
      resourceType: 'webhook',
      resourceId: id,
      requestId: requestId(request),
    });
    return { id, url: body.url, secret };
  }

  @Delete('webhooks/:webhookId')
  @RequirePermissions('api-keys:create')
  async deleteWebhook(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Param('webhookId') webhookId: string,
  ) {
    await this.database.db
      .delete(schema.webhookEndpoints)
      .where(
        and(
          eq(schema.webhookEndpoints.organizationId, actor.organizationId as string),
          eq(schema.webhookEndpoints.id, webhookId),
        ),
      );
    await this.audit.record({
      actor,
      action: 'webhook.deleted',
      resourceType: 'webhook',
      resourceId: webhookId,
      requestId: requestId(request),
    });
    return { id: webhookId, deleted: true };
  }
}
