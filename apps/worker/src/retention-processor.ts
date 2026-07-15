import type { Environment } from '@montenegrina/config';
import type { Database } from '@montenegrina/database';
import { schema } from '@montenegrina/database';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

export class RetentionProcessor {
  constructor(
    private readonly database: Database,
    private readonly environment: Environment,
  ) {}

  async process(): Promise<void> {
    const now = new Date();
    const expired = await this.database.query.conversations.findMany({
      where: and(
        isNotNull(schema.conversations.retentionExpiresAt),
        lt(schema.conversations.retentionExpiresAt, now),
      ),
      limit: 500,
    });
    for (const conversation of expired) {
      const deletionJobId = uuidv7();
      await this.database.transaction(async (transaction) => {
        await transaction.insert(schema.deletionJobs).values({
          id: deletionJobId,
          organizationId: conversation.organizationId,
          resourceType: 'conversation',
          resourceId: conversation.id,
          objectKeys: [],
        });
        await transaction.insert(schema.outboxEvents).values({
          id: uuidv7(),
          organizationId: conversation.organizationId,
          type: 'conversation.delete',
          aggregateId: conversation.id,
          payload: { deletionJobId },
        });
        await transaction
          .update(schema.conversations)
          .set({ deletedAt: now, updatedAt: now })
          .where(eq(schema.conversations.id, conversation.id));
      });
    }
    await this.database
      .delete(schema.auditEvents)
      .where(
        lt(
          schema.auditEvents.occurredAt,
          new Date(now.getTime() - this.environment.AUDIT_RETENTION_DAYS * 86_400_000),
        ),
      );
    await this.database
      .delete(schema.evaluationRuns)
      .where(
        and(
          eq(schema.evaluationRuns.status, 'COMPLETED'),
          lt(
            schema.evaluationRuns.completedAt,
            new Date(now.getTime() - this.environment.EVALUATION_RETENTION_DAYS * 86_400_000),
          ),
        ),
      );
  }
}
