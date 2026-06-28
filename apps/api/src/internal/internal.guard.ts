import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { ApiException } from '../core/api-exception.js';
import { InternalTokenService, type RuntimeClaims } from './internal-token.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    runtimeClaims?: RuntimeClaims;
  }
}

@Injectable()
export class InternalGuard implements CanActivate {
  constructor(private readonly tokens: InternalTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new ApiException({ code: 'INTERNAL_AUTH_REQUIRED', message: 'Runtime authentication is required.', status: 401 });
    }
    try {
      request.runtimeClaims = await this.tokens.verify(authorization.slice(7));
      return true;
    } catch {
      throw new ApiException({ code: 'INTERNAL_TOKEN_INVALID', message: 'Runtime authentication is invalid.', status: 401 });
    }
  }
}

