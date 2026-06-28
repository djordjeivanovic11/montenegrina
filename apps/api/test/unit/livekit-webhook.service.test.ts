import { describe, expect, it, vi } from 'vitest';

import { LiveKitWebhookService } from '../../src/livekit/livekit-webhook.service.js';

describe('LiveKitWebhookService', () => {
  it('skips usage when conversation already has usage records', async () => {
    const conversation = {
      id: 'conv-1',
      organizationId: 'org-1',
      agentId: 'agent-1',
      channel: 'SIP' as const,
      state: 'LISTENING' as const,
      startedAt: new Date(Date.now() - 60_000),
    };
    const insert = vi.fn();
    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    }));
    const transaction = vi.fn(async (callback: (tx: { insert: typeof insert; update: typeof update }) => Promise<void>) => {
      await callback({ insert, update });
    });
    const database = {
      db: {
        query: {
          conversations: { findFirst: vi.fn().mockResolvedValue(conversation) },
          usageRecords: { findFirst: vi.fn().mockResolvedValue({ id: 'usage-1' }) },
        },
        transaction,
      },
    };
    const service = new LiveKitWebhookService(database as never, { MAX_CONVERSATION_MINUTES: 30 } as never);
    await service.handleRoomFinished('call-conv-1');
    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });
});
