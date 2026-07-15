import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Environment } from '@montenegrina/config';
import type { Redis } from 'ioredis';

import { DatabaseService } from '../database/database.service.js';
import { ENVIRONMENT, REDIS } from '../core/tokens.js';
import { Public } from '../security/public.decorator.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStorageService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) reply: FastifyReply) {
    const postgres = await this.database.pool.query('select 1').then(
      () => 'ok' as const,
      () => 'failed' as const,
    );
    const redis = await this.redis.ping().then(
      () => 'ok' as const,
      () => 'failed' as const,
    );
    const storage = await this.storage.ping();
    const checks = { postgres, redis, storage };
    const ok = postgres === 'ok' && redis === 'ok' && storage === 'ok';
    if (!ok) reply.status(503);
    return {
      ok,
      status: ok ? 'ok' : postgres === 'failed' ? 'failed' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
