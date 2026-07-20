import { Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { schema } from '@montenegrina/database';
import { defaultMontenegrinSystemInstruction } from '@montenegrina/language-cnr';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { ENVIRONMENT } from '../core/tokens.js';
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
  constructor(
    private readonly database: DatabaseService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

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

    const starterAgentId = uuidv7();
    const starterVersionId = uuidv7();
    const promptVersionId = uuidv7();
    const languageProfileId = uuidv7();
    const routingPolicyId = uuidv7();
    const knowledgeBaseId = uuidv7();
    const runtimeEnvironment =
      this.environment.NODE_ENV === 'production' ? 'production' : 'development';
    const now = new Date();

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
        currentStep: 'COMPLETED',
        completedAt: now,
      });
      if (freePlan) {
        await transaction.insert(schema.organizationSubscriptions).values({
          organizationId,
          planId: freePlan.id,
          status: 'ACTIVE',
        });
      }
      await transaction.insert(schema.knowledgeBases).values({
        id: knowledgeBaseId,
        organizationId,
        name: 'Default knowledge',
        slug: 'default',
        description: 'Default knowledge base for your workspace',
      });
      await transaction.insert(schema.languageProfiles).values({
        id: languageProfileId,
        organizationId,
        name: 'Default Montenegrin',
        version: 1,
        script: 'LATIN',
        preferIjekavian: true,
        immutable: true,
      });
      await transaction.insert(schema.promptVersions).values({
        id: promptVersionId,
        organizationId,
        name: 'Starter voice assistant',
        version: 1,
        systemInstruction: defaultMontenegrinSystemInstruction,
        immutable: true,
      });
      await transaction.insert(schema.routingPolicies).values({
        id: routingPolicyId,
        organizationId,
        name: 'Starter controlled pipeline',
        environment: runtimeEnvironment,
        domain: 'BROWSER',
        candidateConfigurationIds: [],
        allowedProviders: ['openai', 'elevenlabs'],
        allowedRegions: ['global'],
        allowFallback: true,
        sttLanguage: 'sr',
        settings: {
          pipelineMode: 'controlled',
          sttProvider: 'openai',
          sttModel: 'gpt-4o-transcribe',
          ttsProvider: 'elevenlabs',
        },
      });
      await transaction.insert(schema.deploymentEnvironments).values({
        id: uuidv7(),
        organizationId,
        name: runtimeEnvironment,
        routingPolicyId,
        maximumConcurrentSessions: 1,
        maximumConversationMinutes: Math.min(this.environment.MAX_CONVERSATION_MINUTES, 5),
      });
      await transaction.insert(schema.agents).values({
        id: starterAgentId,
        organizationId,
        name: 'Montenegrina asistent',
        slug: 'montenegrina-asistent',
        description: 'Spreman glasovni asistent za probni razgovor na crnogorskom jeziku.',
      });
      await transaction.insert(schema.agentVersions).values({
        id: starterVersionId,
        organizationId,
        agentId: starterAgentId,
        version: 1,
        status: 'PUBLISHED',
        promptVersionId,
        languageProfileId,
        routingPolicyId,
        createdBy: userId,
        publishedAt: now,
        config: {
          systemPrompt: defaultMontenegrinSystemInstruction,
          languageProfile: {
            script: 'LATIN',
            ijekavian: true,
            glossaryIds: [],
            pronunciationIds: [],
          },
          routingPolicy: {
            mode: 'real',
            pipelineMode: 'controlled',
            sttProvider: 'openai',
            sttLanguage: 'sr',
            sttModel: 'gpt-4o-transcribe',
            ttsProvider: 'elevenlabs',
            fallbackAllowed: true,
            allowedProviders: ['openai', 'elevenlabs'],
            allowedRegions: ['global'],
          },
          retention: {
            transcriptDays: this.environment.TRANSCRIPT_RETENTION_DAYS,
            recordAudio: false,
            audioDays: 0,
          },
          toolIds: [],
          knowledgeBaseIds: [knowledgeBaseId],
          sensitiveWritesEnabled: false,
        },
      });
      await transaction
        .update(schema.agents)
        .set({ publishedVersionId: starterVersionId, updatedAt: now })
        .where(eq(schema.agents.id, starterAgentId));
      await transaction.insert(schema.agentKnowledgeBaseAssignments).values({
        organizationId,
        agentId: starterAgentId,
        knowledgeBaseId,
      });
      type ChannelSeed = {
        type: 'BROWSER' | 'SIP' | 'TWILIO' | 'TELNYX' | 'TELECOM';
        name: string;
        status: 'ACTIVE' | 'INACTIVE' | 'COMING_SOON';
      };
      const channels: ChannelSeed[] = [
        { type: 'BROWSER', name: 'Browser voice', status: 'ACTIVE' },
        {
          type: 'SIP',
          name: 'SIP / Phone',
          status: this.environment.PHONE_INTEGRATIONS_ENABLED ? 'INACTIVE' : 'COMING_SOON',
        },
        { type: 'TWILIO', name: 'Twilio', status: 'COMING_SOON' },
        { type: 'TELNYX', name: 'Telnyx', status: 'COMING_SOON' },
        { type: 'TELECOM', name: 'Telecom provider', status: 'COMING_SOON' },
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
