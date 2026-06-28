import { Injectable } from '@nestjs/common';
import { schema } from '@montenegrina/database';
import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { ApiException } from '../core/api-exception.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';

@Injectable()
export class EvaluationsService {
  constructor(private readonly database: DatabaseService) {}

  async create(
    actor: RequestActor,
    body: { datasetId: string; variants: Array<Record<string, unknown>> },
  ) {
    const organizationId = this.organization(actor);
    const dataset = await this.database.db.query.evaluationDatasets.findFirst({
      where: and(
        eq(schema.evaluationDatasets.organizationId, organizationId),
        eq(schema.evaluationDatasets.id, body.datasetId),
      ),
    });
    if (!dataset) throw new ApiException({ code: 'EVALUATION_DATASET_NOT_FOUND', message: 'Evaluation dataset was not found.', status: 404 });
    if (!body.variants.length) throw new ApiException({ code: 'EVALUATION_VARIANTS_REQUIRED', message: 'At least one evaluation variant is required.' });
    const id = uuidv7();
    await this.database.db.transaction(async (transaction) => {
      await transaction.insert(schema.evaluationRuns).values({
        id,
        organizationId,
        datasetId: body.datasetId,
        status: 'QUEUED',
        variants: body.variants,
      });
      await transaction.insert(schema.outboxEvents).values({
        id: uuidv7(),
        organizationId,
        type: 'evaluation.run',
        aggregateId: id,
        payload: { evaluationRunId: id },
      });
    });
    return this.get(actor, id);
  }

  async get(actor: RequestActor, id: string) {
    const item = await this.database.db.query.evaluationRuns.findFirst({
      where: and(
        eq(schema.evaluationRuns.organizationId, this.organization(actor)),
        eq(schema.evaluationRuns.id, id),
      ),
    });
    if (!item) throw new ApiException({ code: 'EVALUATION_RUN_NOT_FOUND', message: 'Evaluation run was not found.', status: 404 });
    return {
      id: item.id,
      status: item.status,
      reportUrl: item.reportObjectKey ? `/v1/evaluations/runs/${item.id}/report` : undefined,
      metrics: item.metrics,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private organization(actor: RequestActor): string {
    if (!actor.organizationId) throw new ApiException({ code: 'ORGANIZATION_REQUIRED', message: 'Select an organization.', status: 400 });
    return actor.organizationId;
  }
}

