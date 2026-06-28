import { Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { schema } from '@montenegrina/database';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';

import { ApiException } from '../core/api-exception.js';
import { ENVIRONMENT } from '../core/tokens.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class StripeBillingService {
  readonly #stripe: Stripe | null;
  readonly #processedEvents = new Set<string>();

  constructor(
    private readonly database: DatabaseService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {
    this.#stripe =
      environment.STRIPE_SECRET_KEY && environment.BILLING_ENABLED
        ? new Stripe(environment.STRIPE_SECRET_KEY)
        : null;
  }

  assertEnabled(): Stripe {
    if (!this.environment.BILLING_ENABLED || !this.#stripe) {
      throw new ApiException({
        code: 'BILLING_DISABLED',
        message: 'Billing is not enabled.',
        status: 403,
      });
    }
    return this.#stripe;
  }

  priceIdForPlan(planSlug: string): string {
    const map: Record<string, string | undefined> = {
      pro: this.environment.STRIPE_PRICE_PRO,
      business: this.environment.STRIPE_PRICE_BUSINESS,
    };
    const priceId = map[planSlug.toLowerCase()];
    if (!priceId) {
      throw new ApiException({
        code: 'PLAN_NOT_BILLABLE',
        message: 'The selected plan is not available for checkout.',
        status: 422,
      });
    }
    return priceId;
  }

  async createCheckoutSession(options: {
    organizationId: string;
    planSlug: string;
    customerEmail: string;
  }): Promise<{ url: string }> {
    const stripe = this.assertEnabled();
    const priceId = this.priceIdForPlan(options.planSlug);
    const subscription = await this.database.db.query.organizationSubscriptions.findFirst({
      where: eq(schema.organizationSubscriptions.organizationId, options.organizationId),
    });
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ...(subscription?.externalCustomerId
        ? { customer: subscription.externalCustomerId }
        : { customer_email: options.customerEmail }),
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.environment.PUBLIC_WEB_URL}/billing?checkout=success`,
      cancel_url: `${this.environment.PUBLIC_WEB_URL}/billing?checkout=cancel`,
      metadata: {
        organizationId: options.organizationId,
        planSlug: options.planSlug,
      },
      subscription_data: {
        metadata: {
          organizationId: options.organizationId,
          planSlug: options.planSlug,
        },
      },
    });
    if (!session.url) {
      throw new ApiException({
        code: 'CHECKOUT_FAILED',
        message: 'Stripe checkout session could not be created.',
        status: 502,
      });
    }
    return { url: session.url };
  }

  async createPortalSession(organizationId: string): Promise<{ url: string }> {
    const stripe = this.assertEnabled();
    const subscription = await this.database.db.query.organizationSubscriptions.findFirst({
      where: eq(schema.organizationSubscriptions.organizationId, organizationId),
    });
    if (!subscription?.externalCustomerId) {
      throw new ApiException({
        code: 'BILLING_CUSTOMER_MISSING',
        message: 'No Stripe customer exists for this organization.',
        status: 422,
      });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.externalCustomerId,
      return_url: `${this.environment.PUBLIC_WEB_URL}/billing`,
    });
    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ received: true }> {
    const stripe = this.assertEnabled();
    if (!this.environment.STRIPE_WEBHOOK_SECRET) {
      throw new ApiException({
        code: 'WEBHOOK_NOT_CONFIGURED',
        message: 'Stripe webhook secret is not configured.',
        status: 503,
      });
    }
    if (!signature) {
      throw new ApiException({ code: 'WEBHOOK_SIGNATURE_MISSING', message: 'Missing Stripe signature.', status: 400 });
    }
    const event = stripe.webhooks.constructEvent(rawBody, signature, this.environment.STRIPE_WEBHOOK_SECRET);
    if (this.#processedEvents.has(event.id)) {
      return { received: true };
    }
    this.#processedEvents.add(event.id);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.object === 'checkout.session') {
          await this.syncCheckoutSession(session);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        if (subscription.object === 'subscription') {
          await this.syncSubscription(subscription);
        }
        break;
      }
      default:
        break;
    }
    return { received: true };
  }

  private async syncCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
    const organizationId = session.metadata?.organizationId;
    const planSlug = session.metadata?.planSlug;
    if (!organizationId || !planSlug) return;
    const plan = await this.database.db.query.plans.findFirst({
      where: eq(schema.plans.slug, planSlug),
    });
    if (!plan) return;
    await this.database.db
      .update(schema.organizationSubscriptions)
      .set({
        planId: plan.id,
        status: 'ACTIVE',
        externalCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
        currentPeriodStart: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.organizationSubscriptions.organizationId, organizationId));
  }

  private async syncSubscription(subscription: Stripe.Subscription): Promise<void> {
    const organizationId = subscription.metadata?.organizationId;
    if (!organizationId) return;
    const status = subscription.status === 'active' ? 'ACTIVE' : subscription.status === 'canceled' ? 'CANCELED' : 'PAST_DUE';
    const periodStart =
      'current_period_start' in subscription && typeof subscription.current_period_start === 'number'
        ? new Date(subscription.current_period_start * 1000)
        : new Date();
    const periodEnd =
      'current_period_end' in subscription && typeof subscription.current_period_end === 'number'
        ? new Date(subscription.current_period_end * 1000)
        : null;
    await this.database.db
      .update(schema.organizationSubscriptions)
      .set({
        status,
        externalCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? null,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        updatedAt: new Date(),
      })
      .where(eq(schema.organizationSubscriptions.organizationId, organizationId));
  }
}
