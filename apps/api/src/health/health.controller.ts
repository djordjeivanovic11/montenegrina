import { Controller, Get, Inject } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import type { Redis } from 'ioredis';

import { DatabaseService } from '../database/database.service.js';
import { ENVIRONMENT, REDIS } from '../core/tokens.js';
import { Public } from '../security/public.decorator.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
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
  async ready() {
    const checks: Record<string, string> = {};
    const database = await this.database.pool.query('select 1').then(
      () => 'ok',
      () => 'failed',
    );
    const redis = await this.redis.ping().then(
      () => 'ok',
      () => 'failed',
    );
    checks.database = database;
    checks.redis = redis;
    checks.providerMode = 'production';
    return {
      status: database === 'ok' && redis === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
