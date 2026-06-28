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
            findMany: async () => [{ planId: 'plan-free', metric: 'DOCUMENTS', limitValue: 5, period: 'monthly' }],
          },
        },
      },
    } as never);

    vi.spyOn(service, 'getUsage').mockResolvedValue(5);

    await expect(service.assertWithinLimit('org-1', 'DOCUMENTS', 1)).rejects.toBeInstanceOf(ApiException);
    await expect(service.assertWithinLimit('org-1', 'DOCUMENTS', 1)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
  });
});
