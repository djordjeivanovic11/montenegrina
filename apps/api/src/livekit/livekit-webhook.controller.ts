import { Controller, Headers, Inject, Post, Req } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { WebhookReceiver } from 'livekit-server-sdk';
import type { FastifyRequest } from 'fastify';

import { ApiException } from '../core/api-exception.js';
import { ENVIRONMENT } from '../core/tokens.js';
import { Public } from '../security/public.decorator.js';
import { LiveKitWebhookService } from './livekit-webhook.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

@Public()
@Controller('webhooks/livekit')
export class LiveKitWebhookController {
  readonly #receiver: WebhookReceiver;

  constructor(
    private readonly webhooks: LiveKitWebhookService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {
    this.#receiver = new WebhookReceiver(environment.LIVEKIT_API_KEY, environment.LIVEKIT_API_SECRET);
  }

  @Post()
  async receive(@Req() request: FastifyRequest, @Headers('authorization') authorization?: string) {
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    const skipAuth = this.environment.NODE_ENV === 'development' && !authorization;
    let event;
    try {
      event = await this.#receiver.receive(rawBody.toString('utf8'), authorization, skipAuth);
    } catch {
      throw new ApiException({
        code: 'LIVEKIT_WEBHOOK_INVALID',
        message: 'LiveKit webhook verification failed.',
        status: 401,
      });
    }
    const roomName = event.room?.name;
    switch (event.event) {
      case 'participant_left':
        if (roomName) {
          await this.webhooks.handleParticipantLeft(roomName, event.participant?.identity);
        }
        break;
      case 'room_finished':
        if (roomName) await this.webhooks.handleRoomFinished(roomName);
        break;
      case 'egress_ended': {
        const egressRoom = event.egressInfo?.roomName ?? roomName;
        const fileResults =
          event.egressInfo?.fileResults?.map((item) => ({ filename: item.filename })) ?? [];
        if (egressRoom) await this.webhooks.handleEgressEnded(egressRoom, fileResults);
        break;
      }
      default:
        break;
    }
    return { received: true };
  }
}
