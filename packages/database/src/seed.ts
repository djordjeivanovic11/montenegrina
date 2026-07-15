import { loadEnvironment } from '@montenegrina/config';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { createDatabase } from './client.js';
import { planEntitlements, plans } from './schema.js';

const environment = loadEnvironment();
const { db, pool } = createDatabase(environment.DATABASE_URL);

const planDefinitions = [
  {
    slug: 'free',
    name: 'Free',
    description: 'Test Montenegrina with strict limits.',
    sortOrder: 0,
    entitlements: [
      { metric: 'AGENTS' as const, limitValue: 1 },
      { metric: 'VOICE_MINUTES' as const, limitValue: 10 },
      { metric: 'TEXT_MESSAGES' as const, limitValue: 200 },
      { metric: 'DOCUMENTS' as const, limitValue: 20 },
      { metric: 'TEAM_MEMBERS' as const, limitValue: 1 },
      { metric: 'RETRIEVAL_QUERIES' as const, limitValue: 500 },
    ],
  },
  {
    slug: 'pro',
    name: 'Pro',
    description: 'For growing teams deploying production agents.',
    sortOrder: 1,
    entitlements: [
      { metric: 'AGENTS' as const, limitValue: 5 },
      { metric: 'VOICE_MINUTES' as const, limitValue: 500 },
      { metric: 'TEXT_MESSAGES' as const, limitValue: 5000 },
      { metric: 'DOCUMENTS' as const, limitValue: 100 },
      { metric: 'TEAM_MEMBERS' as const, limitValue: 5 },
      { metric: 'RETRIEVAL_QUERIES' as const, limitValue: 10_000 },
    ],
  },
  {
    slug: 'business',
    name: 'Business',
    description: 'Higher limits for institutions and contact centers.',
    sortOrder: 2,
    entitlements: [
      { metric: 'AGENTS' as const, limitValue: 25 },
      { metric: 'VOICE_MINUTES' as const, limitValue: 5000 },
      { metric: 'TEXT_MESSAGES' as const, limitValue: 50_000 },
      { metric: 'DOCUMENTS' as const, limitValue: 1000 },
      { metric: 'TEAM_MEMBERS' as const, limitValue: 25 },
      { metric: 'RETRIEVAL_QUERIES' as const, limitValue: 100_000 },
    ],
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    description: 'Custom limits, SLAs, and dedicated support.',
    sortOrder: 3,
    entitlements: [
      { metric: 'AGENTS' as const, limitValue: 999_999 },
      { metric: 'VOICE_MINUTES' as const, limitValue: 999_999 },
      { metric: 'TEXT_MESSAGES' as const, limitValue: 999_999 },
      { metric: 'DOCUMENTS' as const, limitValue: 999_999 },
      { metric: 'TEAM_MEMBERS' as const, limitValue: 999_999 },
      { metric: 'RETRIEVAL_QUERIES' as const, limitValue: 999_999 },
    ],
  },
];

try {
  for (const planDefinition of planDefinitions) {
    const existingPlan = await db.query.plans.findFirst({
      where: eq(plans.slug, planDefinition.slug),
    });
    const planId = existingPlan?.id ?? uuidv7();
    if (existingPlan) {
      await db
        .update(plans)
        .set({
          name: planDefinition.name,
          description: planDefinition.description,
          sortOrder: planDefinition.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(plans.id, planId));
    } else {
      await db.insert(plans).values({
        id: planId,
        slug: planDefinition.slug,
        name: planDefinition.name,
        description: planDefinition.description,
        sortOrder: planDefinition.sortOrder,
      });
    }
    for (const entitlement of planDefinition.entitlements) {
      await db
        .insert(planEntitlements)
        .values({ id: uuidv7(), planId, ...entitlement })
        .onConflictDoUpdate({
          target: [planEntitlements.planId, planEntitlements.metric],
          set: { limitValue: entitlement.limitValue },
        });
    }
    process.stdout.write(`Seeded or updated plan ${planDefinition.slug}.\n`);
  }
} finally {
  await pool.end();
}
