import { Injectable } from '@nestjs/common';
import { schema } from '@montenegrina/database';
import { v7 as uuidv7 } from 'uuid';

import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(options: {
    actor: RequestActor;
    action: string;
    resourceType: string;
    resourceId?: string;
    requestId: string;
    traceId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }): Promise<void> {
    await this.database.db.insert(schema.auditEvents).values({
      id: uuidv7(),
      organizationId: options.actor.organizationId,
      actorType: options.actor.actorType,
      actorId: options.actor.actorId,
      action: options.action,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      requestId: options.requestId,
      traceId: options.traceId ?? options.requestId.replaceAll('-', '').slice(0, 32),
      before: options.before,
      after: options.after,
    });
  }
}

