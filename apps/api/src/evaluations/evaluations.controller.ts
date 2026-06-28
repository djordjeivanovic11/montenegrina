import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import type { RequestActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.decorator.js';
import { RequirePermissions } from '../security/permissions.decorator.js';
import { EvaluationsService } from './evaluations.service.js';

@Controller('v1/evaluations/runs')
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Post()
  @RequirePermissions('evaluations:create')
  create(
    @CurrentActor() actor: RequestActor,
    @Body() body: { datasetId: string; variants: Array<Record<string, unknown>> },
  ) {
    return this.evaluations.create(actor, body);
  }

  @Get(':runId')
  @RequirePermissions('evaluations:read')
  get(@CurrentActor() actor: RequestActor, @Param('runId') id: string) {
    return this.evaluations.get(actor, id);
  }
}

