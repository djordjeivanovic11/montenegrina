import { Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { schema } from '@montenegrina/database';
import { and, eq } from 'drizzle-orm';
import { RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';
import { v7 as uuidv7 } from 'uuid';

import { AgentsService } from '../agents/agents.service.js';
import { ApiException } from '../core/api-exception.js';
import { ENVIRONMENT } from '../core/tokens.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';
import { parseE164 } from '../livekit/e164.js';
import { LiveKitSipSyncService } from '../livekit/livekit-sip-sync.service.js';
import { LiveKitVoiceService } from '../livekit/livekit-voice.service.js';

@Injectable()
export class PhoneNumbersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly agents: AgentsService,
    private readonly livekitVoice: LiveKitVoiceService,
    private readonly livekitSipSync: LiveKitSipSyncService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  async list(actor: RequestActor) {
    const organizationId = this.organization(actor);
    const items = await this.database.db.query.phoneNumbers.findMany({
      where: eq(schema.phoneNumbers.organizationId, organizationId),
      orderBy: (table, { asc }) => [asc(table.createdAt)],
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        e164: item.e164,
        label: item.label,
        inboundAgentId: item.inboundAgentId,
        enabled: item.enabled,
        callerIdE164: item.callerIdE164,
        livekitDispatchRuleId: item.livekitDispatchRuleId,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      sipConfigured: this.livekitVoice.sipConfigured(),
      inboundConfigured: this.livekitVoice.inboundConfigured(),
      phoneIntegrationsEnabled: this.environment.PHONE_INTEGRATIONS_ENABLED,
    };
  }

  async create(
    actor: RequestActor,
    body: { e164: string; label?: string; inboundAgentId?: string; enabled?: boolean; callerIdE164?: string },
  ) {
    this.assertPhoneIntegrationsEnabled();
    const organizationId = this.organization(actor);
    const e164 = parseE164(body.e164);
    if (body.inboundAgentId) {
      await this.agents.get(actor, body.inboundAgentId);
    }
    const id = uuidv7();
    const enabled = body.enabled ?? false;
    const sipChannel = await this.database.db.query.communicationChannels.findFirst({
      where: and(
        eq(schema.communicationChannels.organizationId, organizationId),
        eq(schema.communicationChannels.type, 'SIP'),
      ),
    });
    await this.database.db.insert(schema.phoneNumbers).values({
      id,
      organizationId,
      channelId: sipChannel?.id ?? null,
      e164,
      label: body.label ?? '',
      inboundAgentId: body.inboundAgentId ?? null,
      enabled,
      callerIdE164: body.callerIdE164 ? parseE164(body.callerIdE164) : null,
    });
    if (enabled && body.inboundAgentId) {
      await this.syncLiveKit(id, e164, true);
    }
    await this.refreshSipChannelStatus(organizationId);
    return this.get(actor, id);
  }

  async update(
    actor: RequestActor,
    id: string,
    body: { label?: string; inboundAgentId?: string | null; enabled?: boolean; callerIdE164?: string | null },
  ) {
    this.assertPhoneIntegrationsEnabled();
    const organizationId = this.organization(actor);
    const existing = await this.find(actor, id);
    if (body.inboundAgentId) {
      await this.agents.get(actor, body.inboundAgentId);
    }
    await this.database.db
      .update(schema.phoneNumbers)
      .set({
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.inboundAgentId !== undefined ? { inboundAgentId: body.inboundAgentId } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.callerIdE164 !== undefined
          ? { callerIdE164: body.callerIdE164 ? parseE164(body.callerIdE164) : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.phoneNumbers.organizationId, organizationId), eq(schema.phoneNumbers.id, id)));
    const updated = await this.find(actor, id);
    if (updated.enabled && updated.inboundAgentId) {
      await this.syncLiveKit(id, updated.e164, true);
    } else {
      if (existing.livekitDispatchRuleId) {
        await this.removeDispatchRule(existing.livekitDispatchRuleId);
        await this.database.db
          .update(schema.phoneNumbers)
          .set({ livekitDispatchRuleId: null, updatedAt: new Date() })
          .where(eq(schema.phoneNumbers.id, id));
      }
      if (existing.enabled) {
        await this.livekitSipSync.removeInboundNumber(existing.e164);
      }
    }
    await this.refreshSipChannelStatus(organizationId);
    return this.get(actor, id);
  }

  async remove(actor: RequestActor, id: string) {
    this.assertPhoneIntegrationsEnabled();
    const organizationId = this.organization(actor);
    const existing = await this.find(actor, id);
    if (existing.livekitDispatchRuleId) {
      await this.removeDispatchRule(existing.livekitDispatchRuleId);
    }
    if (existing.enabled) {
      await this.livekitSipSync.removeInboundNumber(existing.e164);
    }
    await this.database.db
      .delete(schema.phoneNumbers)
      .where(and(eq(schema.phoneNumbers.organizationId, organizationId), eq(schema.phoneNumbers.id, id)));
    await this.refreshSipChannelStatus(organizationId);
    return { id, deleted: true };
  }

  async get(actor: RequestActor, id: string) {
    const item = await this.find(actor, id);
    return {
      id: item.id,
      e164: item.e164,
      label: item.label,
      inboundAgentId: item.inboundAgentId,
      enabled: item.enabled,
      callerIdE164: item.callerIdE164,
      livekitDispatchRuleId: item.livekitDispatchRuleId,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private async syncLiveKit(phoneNumberId: string, e164: string, enabled: boolean): Promise<void> {
    if (enabled) {
      await this.livekitSipSync.addInboundNumber(e164);
      await this.syncDispatchRule(phoneNumberId);
    }
  }

  private async syncDispatchRule(phoneNumberId: string): Promise<void> {
    const inboundTrunkId = this.environment.LIVEKIT_SIP_INBOUND_TRUNK_ID;
    if (!inboundTrunkId) return;
    const phoneNumber = await this.database.db.query.phoneNumbers.findFirst({
      where: eq(schema.phoneNumbers.id, phoneNumberId),
    });
    if (!phoneNumber?.enabled || !phoneNumber.inboundAgentId) return;
    if (phoneNumber.livekitDispatchRuleId) {
      await this.removeDispatchRule(phoneNumber.livekitDispatchRuleId);
    }
    const rule = await this.livekitVoice.sipClient.createSipDispatchRule(
      { type: 'individual', roomPrefix: `in-${phoneNumber.id.slice(0, 8)}-` },
      {
        name: `montenegrina-${phoneNumber.id}`,
        trunkIds: [inboundTrunkId],
        roomConfig: new RoomConfiguration({
          agents: [
            new RoomAgentDispatch({
              agentName: 'montenegrina-voice',
              metadata: JSON.stringify({ mode: 'inbound', phoneNumberId: phoneNumber.id }),
            }),
          ],
        }),
      },
    );
    await this.database.db
      .update(schema.phoneNumbers)
      .set({ livekitDispatchRuleId: rule.sipDispatchRuleId, updatedAt: new Date() })
      .where(eq(schema.phoneNumbers.id, phoneNumberId));
  }

  private async removeDispatchRule(ruleId: string): Promise<void> {
    try {
      await this.livekitVoice.sipClient.deleteSipDispatchRule(ruleId);
    } catch {
      // Rule may already be removed in LiveKit dashboard.
    }
  }

  private async refreshSipChannelStatus(organizationId: string): Promise<void> {
    const enabledCount = await this.database.db.query.phoneNumbers.findMany({
      where: and(eq(schema.phoneNumbers.organizationId, organizationId), eq(schema.phoneNumbers.enabled, true)),
    });
    const status =
      this.environment.PHONE_INTEGRATIONS_ENABLED && enabledCount.length > 0 ? 'ACTIVE' : 'INACTIVE';
    await this.database.db
      .update(schema.communicationChannels)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(schema.communicationChannels.organizationId, organizationId),
          eq(schema.communicationChannels.type, 'SIP'),
        ),
      );
  }

  private async find(actor: RequestActor, id: string) {
    const item = await this.database.db.query.phoneNumbers.findFirst({
      where: and(
        eq(schema.phoneNumbers.organizationId, this.organization(actor)),
        eq(schema.phoneNumbers.id, id),
      ),
    });
    if (!item) {
      throw new ApiException({ code: 'PHONE_NUMBER_NOT_FOUND', message: 'Phone number was not found.', status: 404 });
    }
    return item;
  }

  private organization(actor: RequestActor): string {
    if (!actor.organizationId) {
      throw new ApiException({ code: 'ORGANIZATION_REQUIRED', message: 'Select an organization.', status: 400 });
    }
    return actor.organizationId;
  }

  private assertPhoneIntegrationsEnabled(): void {
    if (!this.environment.PHONE_INTEGRATIONS_ENABLED) {
      throw new ApiException({
        code: 'PHONE_INTEGRATIONS_DISABLED',
        message: 'Phone integrations are disabled on this deployment.',
        status: 403,
      });
    }
  }
}
