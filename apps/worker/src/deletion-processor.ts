import type { Database } from '@montenegrina/database';
import { schema } from '@montenegrina/database';
import { eq } from 'drizzle-orm';

import { ObjectStorage } from './storage.js';

export class DeletionProcessor {
  constructor(
    private readonly database: Database,
    private readonly storage: ObjectStorage,
  ) {}

  async process(data: Record<string, unknown>): Promise<void> {
    const deletionJobId = String(data.deletionJobId);
    const job = await this.database.query.deletionJobs.findFirst({
      where: eq(schema.deletionJobs.id, deletionJobId),
    });
    if (!job) throw new Error('DELETION_JOB_NOT_FOUND');
    await this.database
      .update(schema.deletionJobs)
      .set({ status: 'RUNNING', startedAt: new Date() })
      .where(eq(schema.deletionJobs.id, deletionJobId));
    try {
      for (const key of job.objectKeys) await this.storage.delete(key);
      const counts: Record<string, number> = { objects: job.objectKeys.length };
      if (job.resourceType === 'document') {
        await this.database.delete(schema.documents).where(eq(schema.documents.id, job.resourceId));
        counts.documents = 1;
      } else if (job.resourceType === 'conversation') {
        await this.database.delete(schema.conversations).where(eq(schema.conversations.id, job.resourceId));
        counts.conversations = 1;
      } else if (job.resourceType === 'organization') {
        await this.database.delete(schema.organizations).where(eq(schema.organizations.id, job.resourceId));
        counts.organizations = 1;
      }
      await this.database
        .update(schema.deletionJobs)
        .set({
          organizationId: null,
          status: 'COMPLETED',
          objectKeys: [],
          counts,
          completedAt: new Date(),
        })
        .where(eq(schema.deletionJobs.id, deletionJobId));
    } catch (error) {
      await this.database
        .update(schema.deletionJobs)
        .set({
          status: 'FAILED',
          errorCode: error instanceof Error ? error.message.slice(0, 100) : 'DELETION_FAILED',
          completedAt: new Date(),
        })
        .where(eq(schema.deletionJobs.id, deletionJobId));
      throw error;
    }
  }
}

