import { Injectable } from '@nestjs/common';
import { schema } from '@montenegrina/database';
import { and, desc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../core/api-exception.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';

@Injectable()
export class KnowledgeBasesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestActor) {
    const organizationId = this.organization(actor);
    const items = await this.database.db.query.knowledgeBases.findMany({
      where: eq(schema.knowledgeBases.organizationId, organizationId),
      orderBy: [desc(schema.knowledgeBases.createdAt)],
    });
    return { items: items.map((item) => this.formatBase(item)) };
  }

  async create(
    actor: RequestActor,
    body: { name: string; slug: string; description?: string; defaultLanguage?: string },
    requestId: string,
  ) {
    const organizationId = this.organization(actor);
    const id = uuidv7();
    await this.database.db.insert(schema.knowledgeBases).values({
      id,
      organizationId,
      name: body.name,
      slug: body.slug,
      description: body.description ?? '',
      defaultLanguage: body.defaultLanguage ?? 'cnr',
    });
    await this.audit.record({
      actor,
      action: 'knowledge_base.created',
      resourceType: 'knowledge_base',
      resourceId: id,
      requestId,
      after: { name: body.name, slug: body.slug },
    });
    const item = await this.database.db.query.knowledgeBases.findFirst({ where: eq(schema.knowledgeBases.id, id) });
    return this.formatBase(item as typeof schema.knowledgeBases.$inferSelect);
  }

  async update(
    actor: RequestActor,
    id: string,
    body: Partial<{ name: string; description: string; defaultLanguage: string; enabled: boolean }>,
    requestId: string,
  ) {
    const organizationId = this.organization(actor);
    const existing = await this.requireBase(organizationId, id);
    await this.database.db
      .update(schema.knowledgeBases)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(schema.knowledgeBases.id, id));
    await this.audit.record({
      actor,
      action: 'knowledge_base.updated',
      resourceType: 'knowledge_base',
      resourceId: id,
      requestId,
      before: this.formatBase(existing),
      after: body,
    });
    return this.formatBase(await this.requireBase(organizationId, id));
  }

  async delete(actor: RequestActor, id: string, requestId: string) {
    const organizationId = this.organization(actor);
    const existing = await this.requireBase(organizationId, id);
    const documents = await this.database.db.query.documents.findMany({
      where: and(eq(schema.documents.organizationId, organizationId), eq(schema.documents.knowledgeBaseId, id)),
    });
    if (documents.some((document) => !document.deletedAt)) {
      throw new ApiException({
        code: 'KNOWLEDGE_BASE_NOT_EMPTY',
        message: 'Delete or move documents before deleting the knowledge base.',
        status: 409,
      });
    }
    await this.database.db.delete(schema.knowledgeBases).where(eq(schema.knowledgeBases.id, id));
    await this.audit.record({
      actor,
      action: 'knowledge_base.deleted',
      resourceType: 'knowledge_base',
      resourceId: id,
      requestId,
      before: this.formatBase(existing),
    });
    return { id, deleted: true };
  }

  async listAssignments(actor: RequestActor, knowledgeBaseId: string) {
    const organizationId = this.organization(actor);
    await this.requireBase(organizationId, knowledgeBaseId);
    const items = await this.database.db.query.agentKnowledgeBaseAssignments.findMany({
      where: and(
        eq(schema.agentKnowledgeBaseAssignments.organizationId, organizationId),
        eq(schema.agentKnowledgeBaseAssignments.knowledgeBaseId, knowledgeBaseId),
      ),
    });
    return { items };
  }

  async assign(actor: RequestActor, knowledgeBaseId: string, agentId: string, requestId: string) {
    const organizationId = this.organization(actor);
    await this.requireBase(organizationId, knowledgeBaseId);
    await this.database.db.insert(schema.agentKnowledgeBaseAssignments).values({
      organizationId,
      agentId,
      knowledgeBaseId,
    });
    await this.audit.record({
      actor,
      action: 'knowledge_base.assigned',
      resourceType: 'knowledge_base',
      resourceId: knowledgeBaseId,
      requestId,
      after: { agentId },
    });
    return { agentId, knowledgeBaseId };
  }

  async unassign(actor: RequestActor, knowledgeBaseId: string, agentId: string, requestId: string) {
    const organizationId = this.organization(actor);
    await this.database.db
      .delete(schema.agentKnowledgeBaseAssignments)
      .where(
        and(
          eq(schema.agentKnowledgeBaseAssignments.organizationId, organizationId),
          eq(schema.agentKnowledgeBaseAssignments.knowledgeBaseId, knowledgeBaseId),
          eq(schema.agentKnowledgeBaseAssignments.agentId, agentId),
        ),
      );
    await this.audit.record({
      actor,
      action: 'knowledge_base.unassigned',
      resourceType: 'knowledge_base',
      resourceId: knowledgeBaseId,
      requestId,
      after: { agentId },
    });
    return { agentId, knowledgeBaseId, deleted: true };
  }

  private async requireBase(organizationId: string, id: string) {
    const item = await this.database.db.query.knowledgeBases.findFirst({
      where: and(eq(schema.knowledgeBases.organizationId, organizationId), eq(schema.knowledgeBases.id, id)),
    });
    if (!item) throw new ApiException({ code: 'KNOWLEDGE_BASE_NOT_FOUND', message: 'Knowledge base was not found.', status: 404 });
    return item;
  }

  private organization(actor: RequestActor): string {
    if (!actor.organizationId) throw new ApiException({ code: 'ORGANIZATION_REQUIRED', message: 'Select an organization.', status: 400 });
    return actor.organizationId;
  }

  private formatBase(item: typeof schema.knowledgeBases.$inferSelect) {
    return {
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description,
      defaultLanguage: item.defaultLanguage,
      enabled: item.enabled,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
