import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { schema } from '@montenegrina/database';
import { asc, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';

import { ENVIRONMENT } from '../core/tokens.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.decorator.js';
import { Public } from '../security/public.decorator.js';
import { RequirePermissions } from '../security/permissions.decorator.js';
import { EntitlementsService } from './entitlements.service.js';
import { StripeBillingService } from './stripe.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

@Controller('v1/billing')
export class BillingController {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly database: DatabaseService,
    private readonly stripe: StripeBillingService,
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
        ? 'Use checkout to upgrade your plan.'
        : 'Our team will contact you about upgrading your plan.',
      planSlug: body.planSlug,
    };
  }

  @Post('checkout')
  @RequirePermissions('organizations:update')
  async checkout(@CurrentActor() actor: RequestActor, @Body() body: { planSlug: string }) {
    const user = await this.database.db.query.users.findFirst({
      where: eq(schema.users.id, actor.userId as string),
    });
    return this.stripe.createCheckoutSession({
      organizationId: actor.organizationId as string,
      planSlug: body.planSlug,
      customerEmail: user?.email ?? '',
    });
  }

  @Post('portal')
  @RequirePermissions('organizations:update')
  portal(@CurrentActor() actor: RequestActor) {
    return this.stripe.createPortalSession(actor.organizationId as string);
  }

  @Public()
  @Post('stripe/webhook')
  stripeWebhook(@Req() request: FastifyRequest) {
    const signature = request.headers['stripe-signature'];
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    return this.stripe.handleWebhook(rawBody, typeof signature === 'string' ? signature : undefined);
  }
}
