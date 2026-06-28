import { Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { schema } from '@montenegrina/database';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { DatabaseService } from '../database/database.service.js';
import { ENVIRONMENT } from '../core/tokens.js';

@Injectable()
export class LiveKitWebhookService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  async handleRoomFinished(roomName: string): Promise<void> {
    await this.completeConversationByRoom(roomName);
  }

  async handleParticipantLeft(roomName: string, participantIdentity?: string): Promise<void> {
    if (participantIdentity && !participantIdentity.startsWith('sip-') && !participantIdentity.startsWith('user-')) {
      return;
    }
    await this.completeConversationByRoom(roomName);
  }

  async handleEgressEnded(roomName: string, fileResults: Array<{ filename?: string }>): Promise<void> {
    const conversation = await this.findConversationByRoom(roomName);
    if (!conversation) return;
    const filename = fileResults.find((item) => item.filename)?.filename;
    if (!filename) return;
    await this.database.db
      .update(schema.conversations)
      .set({ recordingObjectKey: filename, updatedAt: new Date() })
      .where(eq(schema.conversations.id, conversation.id));
  }

  private async completeConversationByRoom(roomName: string): Promise<void> {
    const conversation = await this.findConversationByRoom(roomName);
    if (!conversation || conversation.state === 'COMPLETED' || conversation.state === 'FAILED') return;
    const existingUsage = await this.database.db.query.usageRecords.findFirst({
      where: eq(schema.usageRecords.conversationId, conversation.id),
    });
    const completedAt = new Date();
    const durationSeconds = Math.max(
      1,
      Math.ceil((completedAt.getTime() - conversation.startedAt.getTime()) / 1000),
    );
    await this.database.db.transaction(async (transaction) => {
      await transaction
        .update(schema.conversations)
        .set({ state: 'COMPLETED', completedAt, updatedAt: completedAt })
        .where(eq(schema.conversations.id, conversation.id));
      if (
        !existingUsage &&
        (conversation.channel === 'SIP' || conversation.channel === 'BROWSER')
      ) {
        await transaction.insert(schema.usageRecords).values({
          id: uuidv7(),
          organizationId: conversation.organizationId,
          agentId: conversation.agentId,
          conversationId: conversation.id,
          provider: 'livekit',
          model: conversation.channel === 'SIP' ? 'sip' : 'webrtc',
          operation: 'voice_session',
          audioInputSeconds: durationSeconds / 2,
          audioOutputSeconds: durationSeconds / 2,
          occurredAt: completedAt,
        });
      }
    });
  }

  private async findConversationByRoom(roomName: string) {
    return this.database.db.query.conversations.findFirst({
      where: and(
        eq(schema.conversations.livekitRoomName, roomName),
        isNull(schema.conversations.deletedAt),
        sql`${schema.conversations.state} not in ('COMPLETED', 'FAILED')`,
      ),
    });
  }
}
