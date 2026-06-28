import { Injectable } from '@nestjs/common';
import { schema } from '@montenegrina/database';
import { and, eq, gte, sql } from 'drizzle-orm';

import { ApiException } from '../core/api-exception.js';
import { DatabaseService } from '../database/database.service.js';

export type PlanMetric = (typeof schema.planMetric.enumValues)[number];

@Injectable()
export class EntitlementsService {
  constructor(private readonly database: DatabaseService) {}

  async getOrganizationPlan(organizationId: string) {
    const subscription = await this.database.db.query.organizationSubscriptions.findFirst({
      where: eq(schema.organizationSubscriptions.organizationId, organizationId),
    });
    if (!subscription) return undefined;
    const plan = await this.database.db.query.plans.findFirst({
      where: eq(schema.plans.id, subscription.planId),
    });
    const entitlements = plan
      ? await this.database.db.query.planEntitlements.findMany({
          where: eq(schema.planEntitlements.planId, plan.id),
        })
      : [];
    return { subscription, plan, entitlements };
  }

  async getUsage(organizationId: string, metric: PlanMetric, periodStart: Date): Promise<number> {
    switch (metric) {
      case 'AGENTS': {
        const result = await this.database.db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.agents)
          .where(and(eq(schema.agents.organizationId, organizationId), sql`${schema.agents.archivedAt} is null`));
        return result[0]?.count ?? 0;
      }
      case 'TEAM_MEMBERS': {
        const result = await this.database.db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.memberships)
          .where(eq(schema.memberships.organizationId, organizationId));
        return result[0]?.count ?? 0;
      }
      case 'DOCUMENTS': {
        const result = await this.database.db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.documents)
          .where(and(eq(schema.documents.organizationId, organizationId), sql`${schema.documents.deletedAt} is null`));
        return result[0]?.count ?? 0;
      }
      case 'VOICE_MINUTES': {
        const result = await this.database.db
          .select({
            total: sql<number>`coalesce(sum(coalesce(${schema.usageRecords.audioInputSeconds}, 0) + coalesce(${schema.usageRecords.audioOutputSeconds}, 0)), 0)::int`,
          })
          .from(schema.usageRecords)
          .where(
            and(
              eq(schema.usageRecords.organizationId, organizationId),
              gte(schema.usageRecords.occurredAt, periodStart),
            ),
          );
        return Math.ceil((result[0]?.total ?? 0) / 60);
      }
      case 'TEXT_MESSAGES':
      case 'LLM_TOKENS':
      case 'STORAGE_BYTES':
      case 'RETRIEVAL_QUERIES':
        return 0;
      default:
        return 0;
    }
  }

  async assertWithinLimit(organizationId: string, metric: PlanMetric, increment = 1): Promise<void> {
    const planData = await this.getOrganizationPlan(organizationId);
    const entitlement = planData?.entitlements.find((item) => item.metric === metric);
    if (!entitlement) return;
    const periodStart = planData?.subscription.currentPeriodStart ?? new Date();
    const current = await this.getUsage(organizationId, metric, periodStart);
    if (current + increment > entitlement.limitValue) {
      throw new ApiException({
        code: 'QUOTA_EXCEEDED',
        message: `Plan limit exceeded for ${metric.toLowerCase().replace('_', ' ')}.`,
        status: 429,
        details: { metric, limit: entitlement.limitValue, current },
      });
    }
  }

  async getUsageSummary(organizationId: string) {
    const planData = await this.getOrganizationPlan(organizationId);
    const periodStart = planData?.subscription?.currentPeriodStart ?? new Date();
    const metrics: PlanMetric[] = [
      'AGENTS',
      'VOICE_MINUTES',
      'TEXT_MESSAGES',
      'DOCUMENTS',
      'TEAM_MEMBERS',
      'RETRIEVAL_QUERIES',
    ];
    const usage = await Promise.all(
      metrics.map(async (metric) => {
        const entitlement = planData?.entitlements.find((item) => item.metric === metric);
        const current = await this.getUsage(organizationId, metric, periodStart);
        return {
          metric,
          current,
          limit: entitlement?.limitValue ?? null,
          period: entitlement?.period ?? 'monthly',
        };
      }),
    );
    return {
      plan: planData?.plan
        ? { slug: planData.plan.slug, name: planData.plan.name, description: planData.plan.description }
        : null,
      subscription: planData?.subscription
        ? { status: planData.subscription.status, currentPeriodStart: planData.subscription.currentPeriodStart.toISOString() }
        : null,
      usage,
    };
  }
}
