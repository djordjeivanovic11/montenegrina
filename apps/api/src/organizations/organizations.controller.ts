import { Body, Controller, Delete, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { schema } from '@montenegrina/database';
import argon2 from 'argon2';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { randomBytes } from 'node:crypto';

import { ApiException } from '../core/api-exception.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.decorator.js';
import { RequirePermissions } from '../security/permissions.decorator.js';

@Controller('v1')
export class OrganizationsController {
  constructor(private readonly database: DatabaseService) {}

  @Get('organizations')
  async list(@CurrentActor() actor: RequestActor) {
    if (!actor.userId) {
      const organization = await this.database.db.query.organizations.findFirst({
        where: eq(schema.organizations.id, actor.organizationId as string),
      });
      return { items: organization ? [organization] : [] };
    }
    const memberships = await this.database.db.query.memberships.findMany({
      where: eq(schema.memberships.userId, actor.userId),
    });
    const items = memberships.length
      ? await this.database.db.query.organizations.findMany({
          where: inArray(schema.organizations.id, memberships.map((item) => item.organizationId)),
        })
      : [];
    return { items: items.map((item) => this.organization(item)) };
  }

  @Post('organizations')
  async create(
    @CurrentActor() actor: RequestActor,
    @Body() body: { name: string; slug: string },
  ) {
    if (!actor.userId) throw new ApiException({ code: 'USER_REQUIRED', message: 'A user session is required.', status: 403 });
    const id = uuidv7();
    await this.database.db.transaction(async (transaction) => {
      await transaction.insert(schema.organizations).values({ id, name: body.name, slug: body.slug });
      await transaction.insert(schema.memberships).values({ organizationId: id, userId: actor.userId as string, role: 'OWNER' });
    });
    const created = await this.database.db.query.organizations.findFirst({ where: eq(schema.organizations.id, id) });
    return this.organization(created as typeof schema.organizations.$inferSelect);
  }

  @Get('organizations/:organizationId/memberships')
  @RequirePermissions('memberships:read')
  async memberships(@CurrentActor() actor: RequestActor, @Param('organizationId') organizationId: string) {
    this.requireOrganization(actor, organizationId);
    return { items: await this.database.db.query.memberships.findMany({ where: eq(schema.memberships.organizationId, organizationId) }) };
  }

  @Post('api-keys')
  @RequirePermissions('api-keys:create')
  async createApiKey(
    @CurrentActor() actor: RequestActor,
    @Body() body: { name: string; environment: 'development' | 'staging' | 'production'; permissions: string[] },
  ) {
    const organizationId = this.requireOrganization(actor);
    const prefix = randomBytes(6).toString('base64url');
    const secret = randomBytes(32).toString('base64url');
    const id = uuidv7();
    await this.database.db.insert(schema.apiKeys).values({
      id,
      organizationId,
      name: body.name,
      prefix,
      secretHash: await argon2.hash(secret, { type: argon2.argon2id }),
      environment: body.environment,
      permissions: [...new Set(body.permissions)],
    });
    return { id, prefix, key: `mg_${prefix}.${secret}` };
  }

  @Delete('organizations/:organizationId')
  @RequirePermissions('*')
  async deleteOrganization(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
  ) {
    this.requireOrganization(actor, organizationId);
    const id = uuidv7();
    await this.database.db.transaction(async (transaction) => {
      await transaction
        .update(schema.organizations)
        .set({ deletionRequestedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.organizations.id, organizationId));
      await transaction.insert(schema.deletionJobs).values({
        id,
        organizationId,
        resourceType: 'organization',
        resourceId: organizationId,
        objectKeys: [],
      });
      await transaction.insert(schema.outboxEvents).values({
        id: uuidv7(),
        organizationId,
        type: 'tenant.delete',
        aggregateId: organizationId,
        payload: { deletionJobId: id },
      });
    });
    return { id, status: 'QUEUED' };
  }

  private requireOrganization(actor: RequestActor, expected?: string): string {
    if (!actor.organizationId || (expected && actor.organizationId !== expected)) {
      throw new ApiException({ code: 'TENANT_ACCESS_DENIED', message: 'The organization is not accessible.', status: 403 });
    }
    return actor.organizationId;
  }

  private organization(item: typeof schema.organizations.$inferSelect) {
    return {
      id: item.id,
      name: item.name,
      slug: item.slug,
      createdAt: item.createdAt.toISOString(),
    };
  }
}

