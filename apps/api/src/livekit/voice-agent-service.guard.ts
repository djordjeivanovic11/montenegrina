import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import type { FastifyRequest } from 'fastify';

import { ApiException } from '../core/api-exception.js';
import { ENVIRONMENT } from '../core/tokens.js';

@Injectable()
export class VoiceAgentServiceGuard implements CanActivate {
  constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const secret = request.headers['x-voice-agent-secret'];
    if (!this.environment.VOICE_AGENT_SERVICE_SECRET) {
      throw new ApiException({
        code: 'VOICE_AGENT_SERVICE_NOT_CONFIGURED',
        message: 'Voice agent service authentication is not configured.',
        status: 503,
      });
    }
    if (secret !== this.environment.VOICE_AGENT_SERVICE_SECRET) {
      throw new ApiException({
        code: 'VOICE_AGENT_SERVICE_UNAUTHORIZED',
        message: 'Voice agent service authentication failed.',
        status: 401,
      });
    }
    return true;
  }
}
