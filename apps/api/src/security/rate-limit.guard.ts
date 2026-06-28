import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Inject } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import type { Redis } from 'ioredis';
import type { FastifyRequest } from 'fastify';

import { ApiException } from '../core/api-exception.js';
import { ENVIRONMENT, REDIS } from '../core/tokens.js';
import { PUBLIC_ROUTE } from '../security/public.decorator.js';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const path = request.url.split('?')[0] ?? '';
    const ip = request.ip ?? 'unknown';
    if (path.startsWith('/v1/auth/')) {
      await this.checkLimit(`rate:auth:${ip}`, this.environment.RATE_LIMIT_AUTH_PER_MINUTE, 60);
    }
    if (path.includes('/realtime-sessions')) {
      const orgHeader = request.headers['x-organization-id'];
      const org = typeof orgHeader === 'string' ? orgHeader : ip;
      await this.checkLimit(`rate:voice:${org}`, this.environment.RATE_LIMIT_VOICE_SESSIONS_PER_HOUR, 3600);
    }
    return true;
  }

  private async checkLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, windowSeconds);
    if (count > limit) {
      throw new ApiException({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        status: 429,
      });
    }
  }
}
