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
  function normalizationService() {
    return Object.create(ConversationsService.prototype) as {
      normalizeRuntimeEventText: (
        event: {
          type: string;
          payload: Record<string, unknown>;
        },
        config: Record<string, unknown>,
      ) => { payload: Record<string, unknown> };
    };
  }

  it('normalizes voice transcript event text to Latin script before persistence', () => {
    const service = normalizationService();

    const normalized = service.normalizeRuntimeEventText(
      {
        type: 'user.turn.completed',
        payload: { text: 'Шта је ово, шта се дешава?' },
      },
      { languageProfile: { script: 'LATIN' } },
    );

    expect(normalized.payload.text).toBe('Šta je ovo, šta se dešava?');
  });

  it('preserves assistant text delta boundaries exactly', () => {
    const service = normalizationService();
    const text = ' ho\tće\n';

    const normalized = service.normalizeRuntimeEventText(
      {
        type: 'assistant.text.delta',
        payload: { text },
      },
      { languageProfile: { script: 'LATIN' } },
    );

    expect(normalized.payload.text).toBe(text);
  });
});

describe('ConversationsService.realtimeSession', () => {
  it('locks the selected MNE-MCP mode into LiveKit dispatch metadata', async () => {
    const startVoiceSession = vi.fn().mockResolvedValue({
      roomName: 'room-1',
      conversationId: 'conversation-1',
    });
    const createBrowserParticipantToken = vi.fn().mockResolvedValue({
      participantToken: 'participant-token',
      expiresAt: '2026-07-21T12:00:00.000Z',
    });
    const service = new ConversationsService(
      {} as never,
      {} as never,
      { startVoiceSession, createBrowserParticipantToken } as never,
      {} as never,
      {} as never,
      { PUBLIC_LIVEKIT_URL: 'wss://livekit.test' } as never,
    );
    const actor = {
      actorType: 'USER' as const,
      actorId: 'user-1',
      organizationId: 'org-1',
      permissions: new Set(['conversations:create']),
    };

    await service.realtimeSession(actor, 'agent-1', 'Korisnik', true);

    expect(startVoiceSession).toHaveBeenCalledWith(actor, 'agent-1', 'BROWSER', {
      dispatchMetadata: { mneMcpEnabled: true },
    });
  });
});
