import { Injectable } from '@nestjs/common';
import { schema } from '@montenegrina/database';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { DatabaseService } from '../database/database.service.js';

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'workspace';
}

@Injectable()
export class WorkspaceBootstrapService {
  constructor(private readonly database: DatabaseService) {}

  async ensurePersonalWorkspace(userId: string, displayName: string) {
    const memberships = await this.database.db.query.memberships.findMany({
      where: eq(schema.memberships.userId, userId),
    });
    if (memberships.length > 0) {
      const organization = await this.database.db.query.organizations.findFirst({
        where: eq(schema.organizations.id, memberships[0]?.organizationId as string),
      });
      const onboarding = organization
        ? await this.database.db.query.organizationOnboarding.findFirst({
            where: eq(schema.organizationOnboarding.organizationId, organization.id),
          })
        : undefined;
      return { organization, onboarding, created: false };
    }

    const organizationId = uuidv7();
    const name = `${displayName.split(' ')[0] ?? 'My'} Workspace`;
    let slug = slugify(name);
    const existing = await this.database.db.query.organizations.findFirst({
      where: eq(schema.organizations.slug, slug),
    });
    if (existing) slug = `${slug}-${organizationId.slice(0, 8)}`;

    const freePlan = await this.database.db.query.plans.findFirst({
      where: eq(schema.plans.slug, 'free'),
    });

    await this.database.db.transaction(async (transaction) => {
      await transaction.insert(schema.organizations).values({
        id: organizationId,
        name,
        slug,
        useCase: 'GENERAL',
      });
      await transaction.insert(schema.memberships).values({
        organizationId,
        userId,
        role: 'OWNER',
      });
      await transaction.insert(schema.organizationOnboarding).values({
        organizationId,
        currentStep: 'NAME_WORKSPACE',
      });
      if (freePlan) {
        await transaction.insert(schema.organizationSubscriptions).values({
          organizationId,
          planId: freePlan.id,
          status: 'ACTIVE',
        });
      }
      const kbId = uuidv7();
      await transaction.insert(schema.knowledgeBases).values({
        id: kbId,
        organizationId,
        name: 'Default knowledge',
        slug: 'default',
        description: 'Default knowledge base for your workspace',
      });
      const channels = [
        { type: 'BROWSER' as const, name: 'Browser voice', status: 'ACTIVE' as const },
        { type: 'SIP' as const, name: 'SIP / Phone', status: 'COMING_SOON' as const },
        { type: 'TWILIO' as const, name: 'Twilio', status: 'COMING_SOON' as const },
        { type: 'TELNYX' as const, name: 'Telnyx', status: 'COMING_SOON' as const },
        { type: 'TELECOM' as const, name: 'Telecom provider', status: 'COMING_SOON' as const },
      ];
      for (const channel of channels) {
        await transaction.insert(schema.communicationChannels).values({
          id: uuidv7(),
          organizationId,
          type: channel.type,
          name: channel.name,
          status: channel.status,
        });
      }
    });

    const organization = await this.database.db.query.organizations.findFirst({
      where: eq(schema.organizations.id, organizationId),
    });
    const onboarding = await this.database.db.query.organizationOnboarding.findFirst({
      where: eq(schema.organizationOnboarding.organizationId, organizationId),
    });
    return { organization, onboarding, created: true };
  }
}
