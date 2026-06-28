import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { v7 as uuidv7 } from 'uuid';

import type { RequestActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.decorator.js';
import { RequirePermissions } from '../security/permissions.decorator.js';
import { OnboardingService } from './onboarding.service.js';

function requestId(request: FastifyRequest): string {
  return (request.headers['x-request-id'] as string | undefined) ?? uuidv7();
}

@Controller('v1/organizations/:organizationId/onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  @RequirePermissions('organizations:read')
  get(@CurrentActor() actor: RequestActor, @Param('organizationId') organizationId: string) {
    return this.onboarding.get(actor, organizationId);
  }

  @Patch()
  @RequirePermissions('organizations:update')
  update(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Req() request: FastifyRequest,
    @Body()
    body: {
      currentStep?: 'NAME_WORKSPACE' | 'CHOOSE_USE_CASE' | 'CREATE_AGENT' | 'CONFIGURE_AGENT' | 'ADD_KNOWLEDGE' | 'TEST_AGENT' | 'PUBLISH_AGENT' | 'COMPLETED';
      useCase?: 'CUSTOMER_SUPPORT' | 'GOVERNMENT' | 'MUNICIPALITY' | 'BANKING' | 'TELECOM' | 'TOURISM' | 'HEALTHCARE' | 'GENERAL';
      complete?: boolean;
    },
  ) {
    return this.onboarding.update(actor, organizationId, body, requestId(request));
  }
}
