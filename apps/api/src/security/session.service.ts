import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { schema } from '@montenegrina/database';
import argon2 from 'argon2';
import { eq, sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';

import { ApiException } from '../core/api-exception.js';
import { ENVIRONMENT, REDIS } from '../core/tokens.js';
import { DatabaseService } from '../database/database.service.js';

export interface StoredSession {
  userId: string;
  csrfToken: string;
  createdAt: string;
}

const SESSION_TTL_SECONDS = 12 * 60 * 60;

@Injectable()
export class SessionService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  async login(email: string, password: string, reply: FastifyReply) {
    const user = await this.database.db.query.users.findFirst({
      where: sql`lower(${schema.users.email}) = ${email.toLocaleLowerCase('en')}`,
    });
    const valid = user && !user.disabledAt && (await argon2.verify(user.passwordHash, password));
    if (!valid) {
      // Perform a fixed-cost verification path to reduce account enumeration signal.
      if (!user) await argon2.verify(await argon2.hash('invalid-login-sentinel'), password).catch(() => false);
      throw new ApiException({ code: 'AUTHENTICATION_FAILED', message: 'Invalid email or password.', status: 401 });
    }

    const sessionId = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const session: StoredSession = { userId: user.id, csrfToken, createdAt: new Date().toISOString() };
    await this.redis.set(this.sessionKey(sessionId), JSON.stringify(session), 'EX', SESSION_TTL_SECONDS);
    reply.setCookie('montenegrina_session', sessionId, {
      httpOnly: true,
      secure: this.environment.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });
    return { user: this.safeUser(user), csrfToken };
  }

  async get(sessionId: string): Promise<StoredSession | undefined> {
    const raw = await this.redis.get(this.sessionKey(sessionId));
    if (!raw) return undefined;
    await this.redis.expire(this.sessionKey(sessionId), SESSION_TTL_SECONDS);
    return JSON.parse(raw) as StoredSession;
  }

  async logout(sessionId: string | undefined, reply: FastifyReply): Promise<void> {
    if (sessionId) await this.redis.del(this.sessionKey(sessionId));
    reply.clearCookie('montenegrina_session', { path: '/' });
  }

  csrfMatches(expected: string, received: string | undefined): boolean {
    if (!received) return false;
    const expectedDigest = createHash('sha256').update(expected).digest();
    const receivedDigest = createHash('sha256').update(received).digest();
    return timingSafeEqual(expectedDigest, receivedDigest);
  }

  async user(userId: string) {
    const user = await this.database.db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    if (!user || user.disabledAt) {
      throw new ApiException({ code: 'SESSION_INVALID', message: 'The session is no longer valid.', status: 401 });
    }
    return user;
  }

  safeUser(user: typeof schema.users.$inferSelect) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private sessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }
}
