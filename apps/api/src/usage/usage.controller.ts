import { Controller, Get, Query } from '@nestjs/common';
import { schema } from '@montenegrina/database';
import { and, eq, gte, lte, sql } from 'drizzle-orm';

import { ApiException } from '../core/api-exception.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.decorator.js';
import { RequirePermissions } from '../security/permissions.decorator.js';

@Controller('v1/usage')
export class UsageController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @RequirePermissions('usage:read')
  async usage(
    @CurrentActor() actor: RequestActor,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!actor.organizationId) throw new ApiException({ code: 'ORGANIZATION_REQUIRED', message: 'Select an organization.' });
    const conditions = [eq(schema.usageRecords.organizationId, actor.organizationId)];
    if (from) conditions.push(gte(schema.usageRecords.occurredAt, new Date(from)));
    if (to) conditions.push(lte(schema.usageRecords.occurredAt, new Date(to)));
    const items = await this.database.db
      .select({
        provider: schema.usageRecords.provider,
        operation: schema.usageRecords.operation,
        inputTokens: sql<number>`coalesce(sum(${schema.usageRecords.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${schema.usageRecords.outputTokens}), 0)::int`,
        audioInputSeconds: sql<number>`coalesce(sum(${schema.usageRecords.audioInputSeconds}), 0)::float8`,
        audioOutputSeconds: sql<number>`coalesce(sum(${schema.usageRecords.audioOutputSeconds}), 0)::float8`,
        characters: sql<number>`coalesce(sum(${schema.usageRecords.characters}), 0)::int`,
        estimatedCostUsd: sql<number>`coalesce(sum(${schema.usageRecords.estimatedCostUsd}), 0)::float8`,
      })
      .from(schema.usageRecords)
      .where(and(...conditions))
      .groupBy(schema.usageRecords.provider, schema.usageRecords.operation);
    return { items };
  }
}

