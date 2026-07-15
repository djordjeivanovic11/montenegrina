import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { schema } from '@montenegrina/database';
import { eq, sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { v7 as uuidv7 } from 'uuid';

import { ApiException } from '../core/api-exception.js';
import { ENVIRONMENT, REDIS } from '../core/tokens.js';
import { DatabaseService } from '../database/database.service.js';
import { WorkspaceBootstrapService } from '../organizations/workspace-bootstrap.service.js';

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
    private readonly workspaceBootstrap: WorkspaceBootstrapService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

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
    const user = await this.database.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    if (!user || user.disabledAt) {
      throw new ApiException({
        code: 'SESSION_INVALID',
        message: 'The session is no longer valid.',
        status: 401,
      });
    }
    return user;
  }

  async loginWithGoogle(
    {
      googleId,
      email,
      displayName,
      avatarUrl,
    }: { googleId: string; email: string; displayName: string; avatarUrl?: string },
    reply: FastifyReply,
  ) {
    const normalizedEmail = email.trim().toLocaleLowerCase('en');
    let user = await this.database.db.query.users.findFirst({
      where: eq(schema.users.googleId, googleId),
    });
    if (!user) {
      user = await this.database.db.query.users.findFirst({
        where: sql`lower(${schema.users.email}) = ${normalizedEmail}`,
      });
    }
    if (!user && !this.environment.REGISTRATION_ENABLED) {
      throw new ApiException({
        code: 'REGISTRATION_DISABLED',
        message: 'Registration is temporarily unavailable.',
        status: 503,
      });
    }
    if (user?.disabledAt) {
      throw new ApiException({
        code: 'AUTHENTICATION_FAILED',
        message: 'Account is disabled.',
        status: 401,
      });
    }
    if (user) {
      if (!user.googleId || user.avatarUrl !== avatarUrl || user.displayName !== displayName) {
        const rows = await this.database.db
          .update(schema.users)
          .set({ googleId, avatarUrl, displayName, updatedAt: new Date() })
          .where(eq(schema.users.id, user.id))
          .returning();
        if (!rows[0]) {
          throw new ApiException({
            code: 'INTERNAL_ERROR',
            message: 'User update failed.',
            status: 500,
          });
        }
        user = rows[0];
      }
    } else {
      const rows = await this.database.db
        .insert(schema.users)
        .values({ id: uuidv7(), email: normalizedEmail, displayName, googleId, avatarUrl })
        .returning();
      if (!rows[0]) {
        throw new ApiException({
          code: 'INTERNAL_ERROR',
          message: 'User creation failed.',
          status: 500,
        });
      }
      user = rows[0];
    }
    const workspace = await this.workspaceBootstrap.ensurePersonalWorkspace(user.id, displayName);
    return this.createSession(user, reply, workspace);
  }

  safeUser(user: typeof schema.users.$inferSelect) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? undefined,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private async createSession(
    user: typeof schema.users.$inferSelect,
    reply: FastifyReply,
    workspace?: Awaited<ReturnType<WorkspaceBootstrapService['ensurePersonalWorkspace']>>,
  ) {
    const sessionId = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const session: StoredSession = {
      userId: user.id,
      csrfToken,
      createdAt: new Date().toISOString(),
    };
    await this.redis.set(
      this.sessionKey(sessionId),
      JSON.stringify(session),
      'EX',
      SESSION_TTL_SECONDS,
    );
    reply.setCookie('montenegrina_session', sessionId, {
      httpOnly: true,
      secure: this.environment.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });
    const onboarding = workspace?.onboarding;
    return {
      user: this.safeUser(user),
      csrfToken,
      organization: workspace?.organization
        ? {
            id: workspace.organization.id,
            name: workspace.organization.name,
            slug: workspace.organization.slug,
          }
        : undefined,
      onboarding: onboarding
        ? {
            currentStep: onboarding.currentStep,
            completedAt: onboarding.completedAt?.toISOString() ?? null,
            isComplete: onboarding.currentStep === 'COMPLETED' || Boolean(onboarding.completedAt),
          }
        : undefined,
    };
  }

  private sessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }
}
