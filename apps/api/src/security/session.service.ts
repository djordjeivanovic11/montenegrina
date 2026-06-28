import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { schema } from '@montenegrina/database';
import argon2 from 'argon2';
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

  async register(email: string, password: string, displayName: string, reply: FastifyReply) {
    if (password.length < 12) {
      throw new ApiException({ code: 'PASSWORD_TOO_WEAK', message: 'Password must be at least 12 characters.', status: 422 });
    }
    const existing = await this.database.db.query.users.findFirst({
      where: sql`lower(${schema.users.email}) = ${email.toLocaleLowerCase('en')}`,
    });
    if (existing) {
      throw new ApiException({ code: 'EMAIL_ALREADY_REGISTERED', message: 'An account with this email already exists.', status: 409 });
    }
    const userId = uuidv7();
    const rows = await this.database.db
      .insert(schema.users)
      .values({
        id: userId,
        email: email.toLocaleLowerCase('en'),
        displayName,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      })
      .returning();
    const user = rows[0];
    if (!user) throw new ApiException({ code: 'INTERNAL_ERROR', message: 'User creation failed.', status: 500 });
    const workspace = await this.workspaceBootstrap.ensurePersonalWorkspace(user.id, displayName);
    return this.createSession(user, reply, workspace);
  }

  async login(email: string, password: string, reply: FastifyReply) {
    const user = await this.database.db.query.users.findFirst({
      where: sql`lower(${schema.users.email}) = ${email.toLocaleLowerCase('en')}`,
    });
    const valid = user && !user.disabledAt && user.passwordHash != null && (await argon2.verify(user.passwordHash, password));
    if (!valid) {
      if (!user) await argon2.verify(await argon2.hash('invalid-login-sentinel'), password).catch(() => false);
      throw new ApiException({ code: 'AUTHENTICATION_FAILED', message: 'Invalid email or password.', status: 401 });
    }
    await this.workspaceBootstrap.ensurePersonalWorkspace(user.id, user.displayName);
    return this.createSession(user, reply);
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

  async loginWithGoogle(
    { googleId, email, displayName, avatarUrl }: { googleId: string; email: string; displayName: string; avatarUrl?: string },
    reply: FastifyReply,
  ) {
    let user = await this.database.db.query.users.findFirst({
      where: eq(schema.users.googleId, googleId),
    });
    if (!user) {
      user = await this.database.db.query.users.findFirst({
        where: sql`lower(${schema.users.email}) = ${email.toLocaleLowerCase('en')}`,
      });
    }
    if (user) {
      if (user.disabledAt) {
        throw new ApiException({ code: 'AUTHENTICATION_FAILED', message: 'Account is disabled.', status: 401 });
      }
      if (!user.googleId || user.avatarUrl !== avatarUrl) {
        const rows = await this.database.db
          .update(schema.users)
          .set({ googleId, avatarUrl })
          .where(eq(schema.users.id, user.id))
          .returning();
        if (!rows[0]) throw new ApiException({ code: 'INTERNAL_ERROR', message: 'User update failed.', status: 500 });
        user = rows[0];
      }
    } else {
      const rows = await this.database.db
        .insert(schema.users)
        .values({ id: uuidv7(), email, displayName, googleId, avatarUrl })
        .returning();
      if (!rows[0]) throw new ApiException({ code: 'INTERNAL_ERROR', message: 'User creation failed.', status: 500 });
      user = rows[0];
    }
    if (!user) throw new ApiException({ code: 'INTERNAL_ERROR', message: 'Authentication failed.', status: 500 });
    const workspace = await this.workspaceBootstrap.ensurePersonalWorkspace(user.id, displayName);
    return this.createSession(user, reply, workspace);
  }

  async forgotPassword(email: string) {
    const user = await this.database.db.query.users.findFirst({
      where: sql`lower(${schema.users.email}) = ${email.toLocaleLowerCase('en')}`,
    });
    if (!user || !user.passwordHash) {
      return { accepted: true };
    }
    const token = randomBytes(32).toString('base64url');
    await this.database.db.insert(schema.passwordResetTokens).values({
      id: uuidv7(),
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    if (this.environment.NODE_ENV === 'development') {
      process.stdout.write(`Password reset token for ${email}: ${token}\n`);
    }
    return { accepted: true, ...(this.environment.NODE_ENV === 'development' ? { devToken: token } : {}) };
  }

  async resetPassword(token: string, password: string) {
    if (password.length < 12) {
      throw new ApiException({ code: 'PASSWORD_TOO_WEAK', message: 'Password must be at least 12 characters.', status: 422 });
    }
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const reset = await this.database.db.query.passwordResetTokens.findFirst({
      where: eq(schema.passwordResetTokens.tokenHash, tokenHash),
    });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new ApiException({ code: 'RESET_TOKEN_INVALID', message: 'Reset token is invalid or expired.', status: 400 });
    }
    await this.database.db.transaction(async (transaction) => {
      await transaction
        .update(schema.users)
        .set({ passwordHash: await argon2.hash(password, { type: argon2.argon2id }), updatedAt: new Date() })
        .where(eq(schema.users.id, reset.userId));
      await transaction
        .update(schema.passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(schema.passwordResetTokens.id, reset.id));
    });
    return { reset: true };
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
    const session: StoredSession = { userId: user.id, csrfToken, createdAt: new Date().toISOString() };
    await this.redis.set(this.sessionKey(sessionId), JSON.stringify(session), 'EX', SESSION_TTL_SECONDS);
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
