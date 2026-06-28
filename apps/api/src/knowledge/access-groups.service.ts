import { Injectable } from '@nestjs/common';
import { schema } from '@montenegrina/database';
import { and, desc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../core/api-exception.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';

@Injectable()
export class AccessGroupsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestActor) {
    const organizationId = this.organization(actor);
    const items = await this.database.db.query.accessGroups.findMany({
      where: eq(schema.accessGroups.organizationId, organizationId),
      orderBy: [desc(schema.accessGroups.createdAt)],
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        description: item.description,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  async create(
    actor: RequestActor,
    body: { name: string; slug: string; description?: string },
    requestId: string,
  ) {
    const organizationId = this.organization(actor);
    const id = uuidv7();
    await this.database.db.insert(schema.accessGroups).values({
      id,
      organizationId,
      name: body.name,
      slug: body.slug,
      description: body.description ?? '',
    });
    await this.audit.record({
      actor,
      action: 'access_group.created',
      resourceType: 'access_group',
      resourceId: id,
      requestId,
      after: body,
    });
    return { id, ...body };
  }

  async addMember(actor: RequestActor, accessGroupId: string, userId: string, requestId: string) {
    const organizationId = this.organization(actor);
    await this.requireGroup(organizationId, accessGroupId);
    await this.database.db.insert(schema.accessGroupMemberships).values({
      organizationId,
      accessGroupId,
      userId,
    });
    await this.audit.record({
      actor,
      action: 'access_group.member_added',
      resourceType: 'access_group',
      resourceId: accessGroupId,
      requestId,
      after: { userId },
    });
    return { accessGroupId, userId };
  }

  async removeMember(actor: RequestActor, accessGroupId: string, userId: string, requestId: string) {
    const organizationId = this.organization(actor);
    await this.database.db
      .delete(schema.accessGroupMemberships)
      .where(
        and(
          eq(schema.accessGroupMemberships.organizationId, organizationId),
          eq(schema.accessGroupMemberships.accessGroupId, accessGroupId),
          eq(schema.accessGroupMemberships.userId, userId),
        ),
      );
    await this.audit.record({
      actor,
      action: 'access_group.member_removed',
      resourceType: 'access_group',
      resourceId: accessGroupId,
      requestId,
      after: { userId },
    });
    return { accessGroupId, userId, deleted: true };
  }

  private async requireGroup(organizationId: string, id: string) {
    const item = await this.database.db.query.accessGroups.findFirst({
      where: and(eq(schema.accessGroups.organizationId, organizationId), eq(schema.accessGroups.id, id)),
    });
    if (!item) throw new ApiException({ code: 'ACCESS_GROUP_NOT_FOUND', message: 'Access group was not found.', status: 404 });
    return item;
  }

  private organization(actor: RequestActor): string {
    if (!actor.organizationId) throw new ApiException({ code: 'ORGANIZATION_REQUIRED', message: 'Select an organization.', status: 400 });
    return actor.organizationId;
  }
}
