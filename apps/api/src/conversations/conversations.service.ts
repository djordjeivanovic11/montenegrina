import { Inject, Injectable, type MessageEvent as NestMessageEvent } from '@nestjs/common';
import { canTransition, type RealtimeEvent } from '@montenegrina/contracts';
import type { Environment } from '@montenegrina/config';
import { schema } from '@montenegrina/database';
import { processMontenegrin } from '@montenegrina/language-cnr';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { Observable, type Subscriber } from 'rxjs';
import { v7 as uuidv7 } from 'uuid';
import { randomBytes } from 'node:crypto';

import { AgentsService } from '../agents/agents.service.js';
import { ApiException } from '../core/api-exception.js';
import { ENVIRONMENT, REDIS } from '../core/tokens.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';
import { parseE164 } from '../livekit/e164.js';
import { LiveKitVoiceService } from '../livekit/livekit-voice.service.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';

const durableEvents = new Set([
  'session.started',
  'transcription.final',
  'user.turn.completed',
  'turn.started',
  'assistant.text.completed',
  'assistant.audio.started',
  'assistant.audio.completed',
  'assistant.interrupted',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'handoff.requested',
  'handoff.completed',
  'session.completed',
  'error',
]);

const normalizedTextEvents = new Set([
  'transcription.partial',
  'transcription.final',
  'user.turn.completed',
  'assistant.text.delta',
  'assistant.text.completed',
]);

@Injectable()
export class ConversationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly agents: AgentsService,
    private readonly livekitVoice: LiveKitVoiceService,
    private readonly storage: ObjectStorageService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  async create(actor: RequestActor, agentId: string, channel: 'TEXT' | 'BROWSER' | 'SIP' | 'BATCH') {
    const organizationId = this.organization(actor);
    const { version } = await this.agents.published(actor, agentId);
    const id = uuidv7();
    const traceId = randomBytes(16).toString('hex');
    const startedAt = new Date();
    const retentionExpiresAt = new Date(
      startedAt.getTime() + version.config.retention.transcriptDays * 86_400_000,
    );
    await this.database.db.insert(schema.conversations).values({
      id,
      organizationId,
      agentId,
      agentVersionId: version.id,
      channel,
      state: 'INITIALIZING',
      language: 'cnr',
      traceId,
      startedAt,
      retentionExpiresAt,
    });
    return this.get(actor, id);
  }

  async get(actor: RequestActor, id: string) {
    const item = await this.find(actor, id);
    return this.format(item);
  }

  async transcript(actor: RequestActor, id: string) {
    await this.find(actor, id);
    const segments = await this.database.db.query.transcriptSegments.findMany({
      where: and(
        eq(schema.transcriptSegments.organizationId, this.organization(actor)),
        eq(schema.transcriptSegments.conversationId, id),
        eq(schema.transcriptSegments.final, true),
      ),
      orderBy: [asc(schema.transcriptSegments.startedAtMs)],
    });
    return {
      language: 'cnr' as const,
      segments: segments.map((segment) => ({
        id: segment.id,
        speaker: segment.speaker,
        originalText: segment.originalText,
        normalizedText: segment.normalizedText,
        startedAtMs: segment.startedAtMs,
        endedAtMs: segment.endedAtMs,
        final: segment.final,
      })),
    };
  }

  async realtimeSession(actor: RequestActor, agentId: string, participantName?: string) {
    const session = await this.livekitVoice.startVoiceSession(actor, agentId, 'BROWSER');
    const token = await this.livekitVoice.createBrowserParticipantToken(
      session.roomName,
      session.conversationId,
      actor,
      participantName,
    );
    return {
      conversationId: session.conversationId,
      roomName: session.roomName,
      participantToken: token.participantToken,
      livekitUrl: this.environment.PUBLIC_LIVEKIT_URL,
      expiresAt: token.expiresAt,
      language: 'cnr' as const,
    };
  }

  async call(actor: RequestActor, agentId: string, to: string) {
    this.livekitVoice.assertOutboundConfigured();
    const toE164 = parseE164(to);
    const session = await this.livekitVoice.startVoiceSession(actor, agentId, 'SIP', { calledE164: toE164 });
    const fromNumber = session.config.telephony?.outboundCallerId;
    await this.livekitVoice.dialOutbound(session.roomName, session.conversationId, toE164, fromNumber);
    return this.get(actor, session.conversationId);
  }

  async recordingUrl(actor: RequestActor, id: string) {
    const item = await this.find(actor, id);
    if (!item.recordingObjectKey) {
      throw new ApiException({
        code: 'RECORDING_NOT_AVAILABLE',
        message: 'This conversation has no recording.',
        status: 404,
      });
    }
    const expiresInSeconds = 900;
    const url = await this.storage.presignedGetUrl(item.recordingObjectKey, expiresInSeconds);
    return {
      url,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      objectKey: item.recordingObjectKey,
    };
  }

  async handoff(actor: RequestActor, conversationId: string, reason: string) {
    const conversation = await this.find(actor, conversationId);
    const id = uuidv7();
    await this.database.db.transaction(async (transaction) => {
      await transaction.insert(schema.handoffs).values({
        id,
        organizationId: conversation.organizationId,
        conversationId,
        status: 'REQUESTED',
        reason,
      });
      await transaction.insert(schema.outboxEvents).values({
        id: uuidv7(),
        organizationId: conversation.organizationId,
        type: 'handoff.requested',
        aggregateId: conversationId,
        payload: { handoffId: id, reason },
      });
      if (canTransition(conversation.state, 'HANDOFF_PENDING')) {
        await transaction
          .update(schema.conversations)
          .set({ state: 'HANDOFF_PENDING', updatedAt: new Date() })
          .where(eq(schema.conversations.id, conversationId));
      }
    });
    return { id, conversationId, status: 'REQUESTED', requestedAt: new Date().toISOString() };
  }

  async delete(actor: RequestActor, conversationId: string) {
    const conversation = await this.find(actor, conversationId);
    const id = uuidv7();
    await this.database.db.transaction(async (transaction) => {
      await transaction
        .update(schema.conversations)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.conversations.id, conversationId));
      await transaction.insert(schema.deletionJobs).values({
        id,
        organizationId: conversation.organizationId,
        resourceType: 'conversation',
        resourceId: conversationId,
        objectKeys: conversation.recordingObjectKey ? [conversation.recordingObjectKey] : [],
      });
      await transaction.insert(schema.outboxEvents).values({
        id: uuidv7(),
        organizationId: conversation.organizationId,
        type: 'conversation.delete',
        aggregateId: conversationId,
        payload: { deletionJobId: id },
      });
    });
    return { id, status: 'QUEUED' };
  }

  async appendRuntimeEvents(events: RealtimeEvent[]): Promise<{ accepted: number }> {
    if (events.length === 0) return { accepted: 0 };
    const first = events[0] as RealtimeEvent;
    const conversation = await this.database.db.query.conversations.findFirst({
      where: and(
        eq(schema.conversations.id, first.conversationId),
        eq(schema.conversations.organizationId, first.organizationId),
        eq(schema.conversations.agentId, first.agentId),
      ),
    });
    if (!conversation) throw new ApiException({ code: 'RUNTIME_SCOPE_MISMATCH', message: 'Runtime event scope is invalid.', status: 403 });
    const version = await this.database.db.query.agentVersions.findFirst({
      where: and(
        eq(schema.agentVersions.organizationId, conversation.organizationId),
        eq(schema.agentVersions.id, conversation.agentVersionId),
      ),
    });
    const ordered = events
      .map((event) => this.normalizeRuntimeEventText(event, version?.config))
      .sort((left, right) => left.sequence - right.sequence);
    if (
      ordered.some(
        (event) =>
          event.organizationId !== first.organizationId ||
          event.agentId !== first.agentId ||
          event.conversationId !== first.conversationId,
      )
    ) {
      throw new ApiException({ code: 'RUNTIME_EVENT_BATCH_MIXED_SCOPE', message: 'A runtime batch must have one scope.' });
    }
    const conversationStartedAtMs = conversation.startedAt.getTime();
    let accepted = 0;
    await this.database.db.transaction(async (transaction) => {
      let state = conversation.state;
      let lastSequence = conversation.lastSequence;
      for (const event of ordered) {
        if (event.sequence <= lastSequence) continue;
        const nextState = typeof event.payload.state === 'string' ? event.payload.state : undefined;
        if (nextState && nextState !== state) {
          if (!canTransition(state, nextState as typeof state)) {
            throw new ApiException({ code: 'INVALID_CONVERSATION_STATE_TRANSITION', message: `Invalid state transition ${state} -> ${nextState}.`, status: 409 });
          }
          state = nextState as typeof state;
        }
        if (durableEvents.has(event.type)) {
          await transaction
            .insert(schema.conversationEvents)
            .values({
              id: event.eventId,
              organizationId: event.organizationId,
              conversationId: event.conversationId,
              agentId: event.agentId,
              turnId: event.turnId,
              type: event.type,
              sequence: event.sequence,
              traceId: event.traceId,
              payload: event.payload,
              occurredAt: new Date(event.timestamp),
            })
            .onConflictDoNothing();
          const text = typeof event.payload.text === 'string' ? event.payload.text.trim() : '';
          if (text && (event.type === 'user.turn.completed' || event.type === 'assistant.text.completed')) {
            await transaction.insert(schema.transcriptSegments).values({
              id: uuidv7(),
              organizationId: event.organizationId,
              conversationId: event.conversationId,
              turnId: event.turnId,
              speaker: event.type === 'user.turn.completed' ? 'USER' : 'ASSISTANT',
              originalText: text,
              normalizedText: text,
              startedAtMs: Date.now() - conversationStartedAtMs,
              final: true,
            });
          }
        }
        lastSequence = event.sequence;
        accepted += 1;
      }
      await transaction
        .update(schema.conversations)
        .set({
          state,
          lastSequence,
          ...(state === 'COMPLETED' || state === 'FAILED' ? { completedAt: new Date() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.conversations.id, conversation.id));
    });
    for (const event of ordered) {
      await this.redis.publish(this.eventChannel(event.conversationId), JSON.stringify(event));
    }
    return { accepted };
  }

  stream(actor: RequestActor, conversationId: string, afterSequence = 0): Observable<NestMessageEvent> {
    const organizationId = this.organization(actor);
    return new Observable<NestMessageEvent>((subscriber) => {
      const subscription = this.redis.duplicate();
      const start = async (): Promise<void> => {
        const conversation = await this.database.db.query.conversations.findFirst({
          where: and(
            eq(schema.conversations.id, conversationId),
            eq(schema.conversations.organizationId, organizationId),
          ),
        });
        if (!conversation) throw new ApiException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found.', status: 404 });
        const replay = await this.database.db.query.conversationEvents.findMany({
          where: and(
            eq(schema.conversationEvents.conversationId, conversationId),
            gt(schema.conversationEvents.sequence, afterSequence),
          ),
          orderBy: [asc(schema.conversationEvents.sequence)],
        });
        for (const event of replay) this.emitEvent(subscriber, this.databaseEvent(event));
        await subscription.subscribe(this.eventChannel(conversationId));
        subscription.on('message', (_channel, raw) => {
          this.emitEvent(subscriber, JSON.parse(raw) as RealtimeEvent);
        });
      };
      void start().catch((error: unknown) => subscriber.error(error));
      return () => {
        void subscription.unsubscribe(this.eventChannel(conversationId)).finally(() => subscription.disconnect());
      };
    });
  }

  async bootstrap(claims: { organizationId: string; agentId: string; agentVersionId: string; conversationId: string }) {
    const conversation = await this.database.db.query.conversations.findFirst({
      where: and(
        eq(schema.conversations.organizationId, claims.organizationId),
        eq(schema.conversations.agentId, claims.agentId),
        eq(schema.conversations.agentVersionId, claims.agentVersionId),
        eq(schema.conversations.id, claims.conversationId),
      ),
    });
    const version = await this.database.db.query.agentVersions.findFirst({
      where: and(
        eq(schema.agentVersions.organizationId, claims.organizationId),
        eq(schema.agentVersions.id, claims.agentVersionId),
      ),
    });
    if (!conversation || !version) throw new ApiException({ code: 'RUNTIME_SCOPE_MISMATCH', message: 'Runtime scope is invalid.', status: 403 });
    return {
      organizationId: claims.organizationId,
      agentId: claims.agentId,
      agentVersionId: claims.agentVersionId,
      conversationId: claims.conversationId,
      channel: conversation.channel,
      language: 'cnr' as const,
      traceId: conversation.traceId,
      config: version.config,
      lastSequence: conversation.lastSequence,
      maximumDurationMinutes: this.environment.MAX_CONVERSATION_MINUTES,
    };
  }

  private async find(actor: RequestActor, id: string) {
    const item = await this.database.db.query.conversations.findFirst({
      where: and(
        eq(schema.conversations.organizationId, this.organization(actor)),
        eq(schema.conversations.id, id),
        isNull(schema.conversations.deletedAt),
      ),
    });
    if (!item) throw new ApiException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found.', status: 404 });
    return item;
  }

  private organization(actor: RequestActor): string {
    if (!actor.organizationId) throw new ApiException({ code: 'ORGANIZATION_REQUIRED', message: 'Select an organization.', status: 400 });
    return actor.organizationId;
  }

  private format(item: typeof schema.conversations.$inferSelect) {
    return {
      id: item.id,
      organizationId: item.organizationId,
      agentId: item.agentId,
      channel: item.channel,
      state: item.state,
      language: 'cnr' as const,
      calledE164: item.calledE164,
      callerE164: item.callerE164,
      recordingObjectKey: item.recordingObjectKey,
      hasRecording: Boolean(item.recordingObjectKey),
      startedAt: item.startedAt.toISOString(),
      completedAt: item.completedAt?.toISOString() ?? null,
    };
  }

  private eventChannel(conversationId: string): string {
    return `conversation:${conversationId}:events`;
  }

  private emitEvent(subscriber: Subscriber<NestMessageEvent>, event: RealtimeEvent): void {
    subscriber.next({ data: event, id: String(event.sequence), type: event.type });
  }

  private normalizeRuntimeEventText(
    event: RealtimeEvent,
    config?: schema.AgentConfigurationSnapshot,
  ): RealtimeEvent {
    const text = typeof event.payload.text === 'string' ? event.payload.text : '';
    if (!text || !normalizedTextEvents.has(event.type)) return event;
    const language = processMontenegrin(text, {
      outputScript: config?.languageProfile.script ?? 'LATIN',
      preferIjekavian: config?.languageProfile.ijekavian ?? true,
    });
    return {
      ...event,
      payload: {
        ...event.payload,
        text: language.correctedText,
        ...(language.warnings.length
          ? { languageWarnings: language.warnings.map((warning) => warning.code) }
          : {}),
      },
    };
  }

  private databaseEvent(event: typeof schema.conversationEvents.$inferSelect): RealtimeEvent {
    return {
      eventId: event.id,
      type: event.type as RealtimeEvent['type'],
      timestamp: event.occurredAt.toISOString(),
      organizationId: event.organizationId,
      agentId: event.agentId,
      conversationId: event.conversationId,
      ...(event.turnId ? { turnId: event.turnId } : {}),
      traceId: event.traceId,
      sequence: event.sequence,
      payload: event.payload,
    };
  }
}
