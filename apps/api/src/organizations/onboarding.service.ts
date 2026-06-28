import { Injectable } from '@nestjs/common';
import { schema } from '@montenegrina/database';
import { eq } from 'drizzle-orm';

import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../core/api-exception.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async get(actor: RequestActor, organizationId: string) {
    this.requireOrganization(actor, organizationId);
    const onboarding = await this.database.db.query.organizationOnboarding.findFirst({
      where: eq(schema.organizationOnboarding.organizationId, organizationId),
    });
    const organization = await this.database.db.query.organizations.findFirst({
      where: eq(schema.organizations.id, organizationId),
    });
    return {
      organizationId,
      currentStep: onboarding?.currentStep ?? 'COMPLETED',
      completedAt: onboarding?.completedAt?.toISOString() ?? null,
      useCase: organization?.useCase ?? 'GENERAL',
      isComplete: onboarding?.currentStep === 'COMPLETED' || Boolean(onboarding?.completedAt),
    };
  }

  async update(
    actor: RequestActor,
    organizationId: string,
    body: {
      currentStep?: (typeof schema.onboardingStep.enumValues)[number];
      useCase?: (typeof schema.organizationUseCase.enumValues)[number];
      complete?: boolean;
    },
    requestId: string,
  ) {
    this.requireOrganization(actor, organizationId);
    const before = await this.get(actor, organizationId);
    if (body.useCase) {
      await this.database.db
        .update(schema.organizations)
        .set({ useCase: body.useCase, updatedAt: new Date() })
        .where(eq(schema.organizations.id, organizationId));
    }
    const completedAt = body.complete || body.currentStep === 'COMPLETED' ? new Date() : undefined;
    const currentStep = body.complete ? 'COMPLETED' : body.currentStep;
    if (currentStep) {
      await this.database.db
        .insert(schema.organizationOnboarding)
        .values({
          organizationId,
          currentStep,
          ...(completedAt ? { completedAt } : {}),
        })
        .onConflictDoUpdate({
          target: schema.organizationOnboarding.organizationId,
          set: {
            currentStep,
            ...(completedAt ? { completedAt } : {}),
            updatedAt: new Date(),
          },
        });
    }
    await this.audit.record({
      actor,
      action: 'onboarding.updated',
      resourceType: 'organization',
      resourceId: organizationId,
      requestId,
      before,
      after: body,
    });
    return this.get(actor, organizationId);
  }

  private requireOrganization(actor: RequestActor, expected: string): void {
    if (!actor.organizationId || actor.organizationId !== expected) {
      throw new ApiException({ code: 'TENANT_ACCESS_DENIED', message: 'The organization is not accessible.', status: 403 });
    }
  }
}
