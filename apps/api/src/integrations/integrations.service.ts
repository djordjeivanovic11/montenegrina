import { Injectable } from '@nestjs/common';
import { schema } from '@montenegrina/database';
import { eq } from 'drizzle-orm';

import { ApiException } from '../core/api-exception.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';

@Injectable()
export class IntegrationsService {
  constructor(private readonly database: DatabaseService) {}

  async listChannels(actor: RequestActor) {
    const organizationId = this.organization(actor);
    const items = await this.database.db.query.communicationChannels.findMany({
      where: eq(schema.communicationChannels.organizationId, organizationId),
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        name: item.name,
        status: item.status,
        configuration: item.configuration,
      })),
    };
  }

  async listPhoneNumbers(actor: RequestActor) {
    const organizationId = this.organization(actor);
    const items = await this.database.db.query.phoneNumbers.findMany({
      where: eq(schema.phoneNumbers.organizationId, organizationId),
    });
    return { items };
  }

  private organization(actor: RequestActor): string {
    if (!actor.organizationId) throw new ApiException({ code: 'ORGANIZATION_REQUIRED', message: 'Select an organization.', status: 400 });
    return actor.organizationId;
  }
}
