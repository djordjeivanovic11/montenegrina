import { describe, expect, it, vi } from 'vitest';

import { ApiException } from '../../src/core/api-exception.js';
import { ConversationsService } from '../../src/conversations/conversations.service.js';

describe('ConversationsService.recordingUrl', () => {
  it('returns a presigned URL when a recording exists', async () => {
    const presignedGetUrl = vi.fn().mockResolvedValue('https://example.com/recording.ogg');
    const service = new ConversationsService(
      {
        db: {
          query: {
            conversations: {
              findFirst: vi.fn().mockResolvedValue({
                id: 'conv-1',
                organizationId: 'org-1',
                recordingObjectKey: 'recordings/org-1/conv-1.ogg',
                deletedAt: null,
              }),
            },
          },
        },
      } as never,
      {} as never,
      {} as never,
      { presignedGetUrl } as never,
      {} as never,
      {} as never,
    );
    const actor = {
      actorType: 'USER' as const,
      actorId: 'user-1',
      organizationId: 'org-1',
      permissions: new Set(['conversations:read']),
    };
    const result = await service.recordingUrl(actor, 'conv-1');
    expect(result.url).toBe('https://example.com/recording.ogg');
    expect(presignedGetUrl).toHaveBeenCalledWith('recordings/org-1/conv-1.ogg', 900);
  });

  it('throws when no recording is stored', async () => {
    const service = new ConversationsService(
      {
        db: {
          query: {
            conversations: {
              findFirst: vi.fn().mockResolvedValue({
                id: 'conv-1',
                organizationId: 'org-1',
                recordingObjectKey: null,
                deletedAt: null,
              }),
            },
          },
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const actor = {
      actorType: 'USER' as const,
      actorId: 'user-1',
      organizationId: 'org-1',
      permissions: new Set(['conversations:read']),
    };
    await expect(service.recordingUrl(actor, 'conv-1')).rejects.toBeInstanceOf(ApiException);
  });
});

describe('ConversationsService runtime event normalization', () => {
  it('normalizes voice transcript event text to Latin script before persistence', () => {
    const service = Object.create(ConversationsService.prototype) as {
      normalizeRuntimeEventText: (
        event: {
          type: string;
          payload: Record<string, unknown>;
        },
        config: Record<string, unknown>,
      ) => { payload: Record<string, unknown> };
    };

    const normalized = service.normalizeRuntimeEventText(
      {
        type: 'user.turn.completed',
        payload: { text: 'Шта је ово, шта се дешава?' },
      },
      { languageProfile: { script: 'LATIN' } },
    );

    expect(normalized.payload.text).toBe('Šta je ovo, šta se dešava?');
  });
});
