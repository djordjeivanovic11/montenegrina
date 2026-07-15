import { setTimeout as delay } from 'node:timers/promises';

import { loadEnvironment } from '@montenegrina/config';
import { createDatabase, schema } from '@montenegrina/database';
import { Queue, Worker, type Job } from 'bullmq';
import { and, asc, eq, isNull, lte } from 'drizzle-orm';

import { DeletionProcessor } from './deletion-processor.js';
import { DocumentProcessor } from './document-processor.js';
import { EvaluationProcessor } from './evaluation-processor.js';
import { providersFromEnvironment } from './providers.js';
import { queuePrefix } from './queue-config.js';
import { RetentionProcessor } from './retention-processor.js';
import { ObjectStorage } from './storage.js';
import { WebhookDeliveryProcessor } from './webhook-delivery.js';

const environment = loadEnvironment();
const { db, pool } = createDatabase(environment.DATABASE_URL);
const providers = providersFromEnvironment(environment);
const storage = new ObjectStorage(environment);
const documentProcessor = new DocumentProcessor(db, storage, providers);
const evaluationProcessor = new EvaluationProcessor(db, storage, providers, environment);
const deletionProcessor = new DeletionProcessor(db, storage);
const retentionProcessor = new RetentionProcessor(db, environment);
const webhookProcessor = new WebhookDeliveryProcessor(
  db,
  environment.INTERNAL_TOKEN_SECRET,
  environment.WEBHOOKS_ENABLED,
);
const connection = { url: environment.REDIS_URL, maxRetriesPerRequest: null };
const queueOptions = { connection, prefix: queuePrefix };
const queue = new Queue('montenegrina-platform', queueOptions);
const deadLetter = new Queue('montenegrina-dead-letter', queueOptions);
let stopping = false;

async function processJob(job: Job<Record<string, unknown>>): Promise<void> {
  switch (job.name) {
    case 'document.ingest':
      return documentProcessor.process(job.data);
    case 'evaluation.run':
      return evaluationProcessor.process(job.data);
    case 'document.delete':
    case 'conversation.delete':
    case 'tenant.delete':
      return deletionProcessor.process(job.data);
    case 'document.ready':
      return webhookProcessor.process({
        organizationId: job.data.organizationId,
        eventType: 'document.ready',
        payload: job.data,
      });
    case 'webhook.deliver':
      return webhookProcessor.process(job.data);
    case 'retention.run':
      return retentionProcessor.process();
    default:
      throw new Error(`UNKNOWN_JOB_TYPE:${job.name}`);
  }
}

const worker = new Worker<Record<string, unknown>>('montenegrina-platform', processJob, {
  ...queueOptions,
  concurrency: environment.KNOWLEDGE_WORKER_CONCURRENCY,
  lockDuration: Math.max(120_000, environment.KNOWLEDGE_PARSER_TIMEOUT_SECONDS * 1_000),
});
worker.on('failed', (job, error) => {
  if (job && job.attemptsMade >= Number(job.opts.attempts ?? 1)) {
    void deadLetter.add(
      job.name,
      { originalJobId: job.id, data: job.data, errorCode: error.message.slice(0, 100) },
      { removeOnComplete: false },
    );
  }
});

async function dispatchOutbox(): Promise<void> {
  while (!stopping) {
    const events = await db.query.outboxEvents.findMany({
      where: and(
        isNull(schema.outboxEvents.processedAt),
        isNull(schema.outboxEvents.failedAt),
        lte(schema.outboxEvents.availableAt, new Date()),
      ),
      orderBy: [asc(schema.outboxEvents.createdAt)],
      limit: 50,
    });
    for (const event of events) {
      try {
        await queue.add(event.type, event.payload, {
          jobId: event.id,
          attempts: 5,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: 1_000,
          removeOnFail: false,
        });
        await db
          .update(schema.outboxEvents)
          .set({ processedAt: new Date() })
          .where(eq(schema.outboxEvents.id, event.id));
      } catch (error) {
        const attempts = event.attempts + 1;
        await db
          .update(schema.outboxEvents)
          .set({
            attempts,
            availableAt: new Date(Date.now() + Math.min(60_000, 2 ** attempts * 1_000)),
            ...(attempts >= 5
              ? {
                  failedAt: new Date(),
                  errorCode: error instanceof Error ? error.message.slice(0, 100) : 'OUTBOX_FAILED',
                }
              : {}),
          })
          .where(eq(schema.outboxEvents.id, event.id));
      }
    }
    await delay(events.length ? 100 : 1_000);
  }
}

await queue.upsertJobScheduler(
  'retention-daily',
  { pattern: '0 3 * * *' },
  { name: 'retention.run', data: {}, opts: { attempts: 3, removeOnComplete: 30 } },
);

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  process.stdout.write(`${signal}: draining worker\n`);
  await worker.close();
  await queue.close();
  await deadLetter.close();
  await pool.end();
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

await dispatchOutbox();
