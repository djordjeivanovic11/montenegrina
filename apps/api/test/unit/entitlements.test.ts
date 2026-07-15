import { describe, expect, it, vi } from 'vitest';

import { ApiException } from '../../src/core/api-exception.js';
import { EntitlementsService } from '../../src/billing/entitlements.service.js';

describe('EntitlementsService', () => {
  it('throws QUOTA_EXCEEDED when limit would be exceeded', async () => {
    const service = new EntitlementsService({
      db: {
        query: {
          organizationSubscriptions: {
            findFirst: async () => ({
              organizationId: 'org-1',
              planId: 'plan-free',
              status: 'ACTIVE',
              currentPeriodStart: new Date(),
            }),
          },
          plans: {
            findFirst: async () => ({ id: 'plan-free', slug: 'free', name: 'Free' }),
          },
          planEntitlements: {
            findMany: async () => [
              { planId: 'plan-free', metric: 'DOCUMENTS', limitValue: 5, period: 'monthly' },
            ],
          },
        },
      },
    } as never);

    vi.spyOn(service, 'getUsage').mockResolvedValue(5);

    await expect(service.assertWithinLimit('org-1', 'DOCUMENTS', 1)).rejects.toBeInstanceOf(
      ApiException,
    );
    await expect(service.assertWithinLimit('org-1', 'DOCUMENTS', 1)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
  });

  it('enforces the ten-minute monthly free voice allowance', async () => {
    const service = new EntitlementsService({
      db: {
        query: {
          organizationSubscriptions: {
            findFirst: async () => ({
              organizationId: 'org-1',
              planId: 'plan-free',
              status: 'ACTIVE',
              currentPeriodStart: new Date('2026-07-01T00:00:00Z'),
            }),
          },
          plans: { findFirst: async () => ({ id: 'plan-free', slug: 'free', name: 'Free' }) },
          planEntitlements: {
            findMany: async () => [
              { planId: 'plan-free', metric: 'VOICE_MINUTES', limitValue: 10, period: 'monthly' },
            ],
          },
        },
      },
    } as never);
    vi.spyOn(service, 'getUsage').mockResolvedValue(10);

    await expect(service.assertWithinLimit('org-1', 'VOICE_MINUTES', 1)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
      safeDetails: { metric: 'VOICE_MINUTES', limit: 10, current: 10 },
    });
  });
});
