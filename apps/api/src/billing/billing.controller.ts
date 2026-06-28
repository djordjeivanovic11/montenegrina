import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { schema } from '@montenegrina/database';
import { asc, eq } from 'drizzle-orm';

import { ENVIRONMENT } from '../core/tokens.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.decorator.js';
import { RequirePermissions } from '../security/permissions.decorator.js';
import { EntitlementsService } from './entitlements.service.js';

@Controller('v1/billing')
export class BillingController {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly database: DatabaseService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  @Get('plans')
  async listPlans() {
    const items = await this.database.db.query.plans.findMany({
      where: eq(schema.plans.isPublic, true),
      orderBy: [asc(schema.plans.sortOrder)],
    });
    const entitlements = await this.database.db.query.planEntitlements.findMany({});
    return {
      items: items.map((plan) => ({
        id: plan.id,
        slug: plan.slug,
        name: plan.name,
        description: plan.description,
        entitlements: entitlements
          .filter((item) => item.planId === plan.id)
          .map((item) => ({ metric: item.metric, limit: item.limitValue, period: item.period })),
      })),
      billingEnabled: this.environment.BILLING_ENABLED,
    };
  }

  @Get('usage-summary')
  @RequirePermissions('usage:read')
  usageSummary(@CurrentActor() actor: RequestActor) {
    return this.entitlements.getUsageSummary(actor.organizationId as string);
  }

  @Post('upgrade-request')
  @RequirePermissions('organizations:update')
  upgradeRequest(@CurrentActor() actor: RequestActor, @Body() body: { planSlug: string; message?: string }) {
    return {
      accepted: true,
      billingEnabled: this.environment.BILLING_ENABLED,
      message: this.environment.BILLING_ENABLED
        ? 'Billing checkout is not yet configured.'
        : 'Our team will contact you about upgrading your plan.',
      planSlug: body.planSlug,
    };
  }
}
