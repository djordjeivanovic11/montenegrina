import { Inject, Injectable } from '@nestjs/common';
import type { AgentConfigurationSnapshot } from '@montenegrina/database/schema';
import type { Environment } from '@montenegrina/config';
import { schema } from '@montenegrina/database';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  RoomAgentDispatch,
  RoomServiceClient,
  S3Upload,
  SipClient,
} from 'livekit-server-sdk';
import { randomBytes } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';

import { AgentsService } from '../agents/agents.service.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { ApiException } from '../core/api-exception.js';
import { ENVIRONMENT } from '../core/tokens.js';
import { DatabaseService } from '../database/database.service.js';
import { InternalTokenService } from '../internal/internal-token.service.js';
import type { RequestActor } from '../security/actor.js';
import { normalizeE164 } from './e164.js';

type VoiceChannel = 'BROWSER' | 'SIP';

interface VoiceConversationContext {
  organizationId: string;
  agentId: string;
  agentVersionId: string;
  conversationId: string;
  roomName: string;
  runtimeToken: string;
  config: AgentConfigurationSnapshot;
}

@Injectable()
export class LiveKitVoiceService {
  readonly #rooms: RoomServiceClient;
  readonly #sip: SipClient;
  readonly #egress: EgressClient;
  readonly #httpUrl: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly agents: AgentsService,
    private readonly entitlements: EntitlementsService,
    private readonly internalTokens: InternalTokenService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {
    this.#httpUrl = environment.LIVEKIT_URL.replace(/^ws/u, 'http');
    this.#rooms = new RoomServiceClient(
      this.#httpUrl,
      environment.LIVEKIT_API_KEY,
      environment.LIVEKIT_API_SECRET,
    );
    this.#sip = new SipClient(
      this.#httpUrl,
      environment.LIVEKIT_API_KEY,
      environment.LIVEKIT_API_SECRET,
    );
    this.#egress = new EgressClient(
      this.#httpUrl,
      environment.LIVEKIT_API_KEY,
      environment.LIVEKIT_API_SECRET,
    );
  }

  assertOutboundConfigured(): void {
    if (!this.environment.LIVEKIT_SIP_OUTBOUND_TRUNK_ID) {
      throw new ApiException({
        code: 'SIP_NOT_CONFIGURED',
        message: 'An outbound LiveKit SIP trunk is required.',
        status: 503,
        retryable: false,
      });
    }
  }

  async assertVoiceEntitlements(organizationId: string): Promise<void> {
    await this.entitlements.assertWithinLimit(organizationId, 'VOICE_MINUTES', 1);
    const active = await this.database.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.organizationId, organizationId),
          inArray(schema.conversations.state, [
            'INITIALIZING',
            'LISTENING',
            'TRANSCRIBING',
            'THINKING',
            'TOOL_PENDING',
            'SPEAKING',
            'INTERRUPTED',
            'HANDOFF_PENDING',
          ]),
          isNull(schema.conversations.deletedAt),
        ),
      );
    if ((active[0]?.count ?? 0) >= this.environment.MAX_CONCURRENT_SESSIONS) {
      throw new ApiException({
        code: 'CONCURRENT_SESSION_QUOTA_EXCEEDED',
        message: 'The organization session quota is exhausted.',
        status: 429,
        retryable: true,
      });
    }
  }

  async startVoiceSession(
    actor: RequestActor,
    agentId: string,
    channel: VoiceChannel,
    options?: {
      calledE164?: string;
      callerE164?: string;
      roomPrefix?: string;
      dispatchMetadata?: Record<string, unknown>;
    },
  ): Promise<VoiceConversationContext> {
    const organizationId = actor.organizationId as string;
    await this.assertVoiceEntitlements(organizationId);
    const { version } = await this.agents.published(actor, agentId);
    const conversationId = uuidv7();
    const traceId = randomBytes(16).toString('hex');
    const startedAt = new Date();
    const retentionExpiresAt = new Date(
      startedAt.getTime() + version.config.retention.transcriptDays * 86_400_000,
    );
    await this.database.db.insert(schema.conversations).values({
      id: conversationId,
      organizationId,
      agentId,
      agentVersionId: version.id,
      channel,
      state: 'INITIALIZING',
      language: 'cnr',
      traceId,
      startedAt,
      retentionExpiresAt,
      ...(options?.calledE164 ? { calledE164: options.calledE164 } : {}),
      ...(options?.callerE164 ? { callerE164: options.callerE164 } : {}),
    });
    const roomName =
      options?.roomPrefix ??
      (channel === 'SIP'
        ? `call-${conversationId}`
        : `cnr-${organizationId.slice(0, 8)}-${conversationId}`);
    const runtimeToken = await this.internalTokens.issue({
      organizationId,
      agentId,
      agentVersionId: version.id,
      conversationId,
    });
    const dispatchMetadata = {
      runtimeToken,
      conversationId,
      ...(options?.dispatchMetadata ?? {}),
    };
    await this.#rooms.createRoom({
      name: roomName,
      emptyTimeout: 300,
      departureTimeout: 20,
      maxParticipants: 4,
      metadata: JSON.stringify({ organizationId, agentId, conversationId, channel }),
      agents: [
        new RoomAgentDispatch({
          agentName: 'montenegrina-voice',
          metadata: JSON.stringify(dispatchMetadata),
        }),
      ],
    });
    await this.database.db
      .update(schema.conversations)
      .set({ livekitRoomName: roomName, updatedAt: new Date() })
      .where(eq(schema.conversations.id, conversationId));
    await this.startRoomEgressIfEnabled(roomName, organizationId, conversationId, version.config);
    return {
      organizationId,
      agentId,
      agentVersionId: version.id,
      conversationId,
      roomName,
      runtimeToken,
      config: version.config,
    };
  }

  async createBrowserParticipantToken(
    roomName: string,
    conversationId: string,
    actor: RequestActor,
    participantName?: string,
  ): Promise<{ participantToken: string; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    const token = new AccessToken(
      this.environment.LIVEKIT_API_KEY,
      this.environment.LIVEKIT_API_SECRET,
      {
        identity: `user-${actor.actorId}-${uuidv7()}`,
        name: participantName ?? 'Korisnik',
        ttl: 300,
        metadata: JSON.stringify({ conversationId, language: 'cnr' }),
      },
    );
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return { participantToken: await token.toJwt(), expiresAt: expiresAt.toISOString() };
  }

  async dialOutbound(
    roomName: string,
    conversationId: string,
    toE164: string,
    fromNumber?: string,
  ): Promise<string | undefined> {
    this.assertOutboundConfigured();
    const participant = await this.#sip.createSipParticipant(
      this.environment.LIVEKIT_SIP_OUTBOUND_TRUNK_ID as string,
      toE164,
      roomName,
      {
        participantIdentity: `sip-${conversationId}`,
        participantName: toE164,
        participantMetadata: JSON.stringify({ conversationId }),
        ...(fromNumber ? { fromNumber } : {}),
        waitUntilAnswered: false,
      },
    );
    await this.database.db
      .update(schema.conversations)
      .set({ externalCallId: participant.sipCallId, updatedAt: new Date() })
      .where(eq(schema.conversations.id, conversationId));
    return participant.sipCallId;
  }

  async provisionInbound(input: {
    roomName: string;
    calledNumber: string;
    callerNumber: string;
    sipCallId?: string;
    phoneNumberId?: string;
  }): Promise<{ runtimeToken: string; conversationId: string }> {
    const calledE164 = normalizeE164(input.calledNumber);
    const callerE164 = normalizeE164(input.callerNumber);
    let phoneNumber = input.phoneNumberId
      ? await this.database.db.query.phoneNumbers.findFirst({
          where: and(
            eq(schema.phoneNumbers.id, input.phoneNumberId),
            eq(schema.phoneNumbers.enabled, true),
          ),
        })
      : undefined;
    if (!phoneNumber) {
      phoneNumber = await this.database.db.query.phoneNumbers.findFirst({
        where: and(eq(schema.phoneNumbers.e164, calledE164), eq(schema.phoneNumbers.enabled, true)),
      });
    }
    if (!phoneNumber?.inboundAgentId) {
      throw new ApiException({
        code: 'PHONE_NUMBER_NOT_ROUTED',
        message: 'No inbound agent is configured for this phone number.',
        status: 404,
      });
    }
    const organizationId = phoneNumber.organizationId;
    await this.assertVoiceEntitlements(organizationId);
    const actor: RequestActor = {
      actorType: 'SERVICE',
      actorId: 'voice-agent',
      organizationId,
      permissions: new Set(['agents:read']),
    };
    const { version } = await this.agents.published(actor, phoneNumber.inboundAgentId);
    const conversationId = uuidv7();
    const traceId = randomBytes(16).toString('hex');
    const startedAt = new Date();
    const retentionExpiresAt = new Date(
      startedAt.getTime() + version.config.retention.transcriptDays * 86_400_000,
    );
    await this.database.db.insert(schema.conversations).values({
      id: conversationId,
      organizationId,
      agentId: phoneNumber.inboundAgentId,
      agentVersionId: version.id,
      channel: 'SIP',
      state: 'INITIALIZING',
      language: 'cnr',
      traceId,
      startedAt,
      retentionExpiresAt,
      livekitRoomName: input.roomName,
      callerE164,
      calledE164,
      externalCallId: input.sipCallId ?? null,
    });
    const runtimeToken = await this.internalTokens.issue({
      organizationId,
      agentId: phoneNumber.inboundAgentId,
      agentVersionId: version.id,
      conversationId,
    });
    await this.startRoomEgressIfEnabled(
      input.roomName,
      organizationId,
      conversationId,
      version.config,
    );
    return { runtimeToken, conversationId };
  }

  async startRoomEgressIfEnabled(
    roomName: string,
    organizationId: string,
    conversationId: string,
    config: AgentConfigurationSnapshot,
  ): Promise<void> {
    if (!this.environment.RECORDINGS_ENABLED || !config.retention.recordAudio) return;
    const accessKey =
      this.environment.LIVEKIT_EGRESS_S3_ACCESS_KEY_ID ?? this.environment.S3_ACCESS_KEY_ID;
    const secretKey =
      this.environment.LIVEKIT_EGRESS_S3_SECRET_ACCESS_KEY ?? this.environment.S3_SECRET_ACCESS_KEY;
    if (!accessKey || !secretKey) return;
    const recordingKey = `recordings/${organizationId}/${conversationId}.ogg`;
    try {
      const output = new EncodedFileOutput({
        fileType: EncodedFileType.OGG,
        filepath: recordingKey,
        output: {
          case: 's3',
          value: new S3Upload({
            accessKey,
            secret: secretKey,
            bucket: this.environment.S3_BUCKET,
            region: this.environment.S3_REGION,
            ...(this.environment.S3_ENDPOINT
              ? { endpoint: this.environment.S3_ENDPOINT.replace(/^http:\/\//u, 'https://') }
              : {}),
          }),
        },
      });
      await this.#egress.startRoomCompositeEgress(roomName, output, { audioOnly: true });
      await this.database.db
        .update(schema.conversations)
        .set({ recordingObjectKey: recordingKey, updatedAt: new Date() })
        .where(eq(schema.conversations.id, conversationId));
    } catch {
      // Recording is best-effort; LiveKit Cloud must reach S3.
    }
  }

  get sipClient(): SipClient {
    return this.#sip;
  }

  sipConfigured(): boolean {
    return Boolean(this.environment.LIVEKIT_SIP_OUTBOUND_TRUNK_ID);
  }

  inboundConfigured(): boolean {
    return Boolean(this.environment.LIVEKIT_SIP_INBOUND_TRUNK_ID);
  }
}
