import { describe, expect, it, vi } from 'vitest';

import { WorkspaceBootstrapService } from '../../src/organizations/workspace-bootstrap.service.js';

describe('WorkspaceBootstrapService', () => {
  it('provisions the free plan, default knowledge base, and published starter voice agent', async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const transaction = {
      insert: vi.fn(() => ({
        values: vi.fn(async (value: Record<string, unknown>) => {
          inserted.push(value);
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      })),
    };
    let organizationLookup = 0;
    const database = {
      db: {
        query: {
          memberships: { findMany: vi.fn().mockResolvedValue([]) },
          organizations: {
            findFirst: vi.fn(async () => {
              organizationLookup += 1;
              return organizationLookup === 1
                ? undefined
                : { id: 'created-org', name: 'Ana Workspace', slug: 'ana-workspace' };
            }),
          },
          plans: { findFirst: vi.fn().mockResolvedValue({ id: 'free-plan', slug: 'free' }) },
          organizationOnboarding: {
            findFirst: vi
              .fn()
              .mockResolvedValue({ organizationId: 'created-org', currentStep: 'COMPLETED' }),
          },
        },
        transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<void>) =>
          callback(transaction),
        ),
      },
    };
    const service = new WorkspaceBootstrapService(
      database as never,
      {
        NODE_ENV: 'production',
        MAX_CONVERSATION_MINUTES: 5,
        TRANSCRIPT_RETENTION_DAYS: 30,
        PHONE_INTEGRATIONS_ENABLED: false,
      } as never,
    );

    const result = await service.ensurePersonalWorkspace('user-1', 'Ana Petrović');

    expect(result.created).toBe(true);
    expect(inserted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ planId: 'free-plan', status: 'ACTIVE' }),
        expect.objectContaining({ name: 'Default knowledge', slug: 'default' }),
        expect.objectContaining({ name: 'Montenegrina asistent', slug: 'montenegrina-asistent' }),
        expect.objectContaining({ version: 1, status: 'PUBLISHED', createdBy: 'user-1' }),
        expect.objectContaining({ name: 'Browser voice', type: 'BROWSER', status: 'ACTIVE' }),
      ]),
    );
  });
});
