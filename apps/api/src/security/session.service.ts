import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { schema } from '@montenegrina/database';
import argon2 from 'argon2';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { v7 as uuidv7 } from 'uuid';

import { EmailServiceWrapper } from '../email/email.service.js';
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
    private readonly email: EmailServiceWrapper,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  async register(
    email: string,
    password: string,
    displayName: string,
    turnstileToken: string | undefined,
    remoteIp: string,
    reply: FastifyReply,
  ) {
    if (!this.environment.REGISTRATION_ENABLED) {
      throw new ApiException({
        code: 'REGISTRATION_DISABLED',
        message: 'Registration is temporarily unavailable.',
        status: 503,
      });
    }
    await this.verifyTurnstile(turnstileToken, remoteIp);
    const normalizedEmail = email.trim().toLocaleLowerCase('en');
    const existing = await this.database.db.query.users.findFirst({
      where: sql`lower(${schema.users.email}) = ${normalizedEmail}`,
    });
    if (existing) {
      throw new ApiException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'An account with this email already exists.',
        status: 409,
      });
    }
    const userId = uuidv7();
    const rows = await this.database.db
      .insert(schema.users)
      .values({
        id: userId,
        email: normalizedEmail,
        displayName: displayName.trim(),
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        emailVerifiedAt: this.environment.EMAIL_VERIFICATION_REQUIRED ? null : new Date(),
      })
      .returning();
    const user = rows[0];
    if (!user)
      throw new ApiException({
        code: 'INTERNAL_ERROR',
        message: 'User creation failed.',
        status: 500,
      });
    if (this.environment.EMAIL_VERIFICATION_REQUIRED) {
      await this.sendVerification(user);
      return { accepted: true, verificationRequired: true };
    }
    const workspace = await this.workspaceBootstrap.ensurePersonalWorkspace(user.id, displayName);
    return this.createSession(user, reply, workspace);
  }

  async login(email: string, password: string, reply: FastifyReply) {
    const user = await this.database.db.query.users.findFirst({
      where: sql`lower(${schema.users.email}) = ${email.toLocaleLowerCase('en')}`,
    });
    const valid =
      user &&
      !user.disabledAt &&
      user.passwordHash != null &&
      (await argon2.verify(user.passwordHash, password));
    if (!valid) {
      if (!user)
        await argon2
          .verify(await argon2.hash('invalid-login-sentinel'), password)
          .catch(() => false);
      throw new ApiException({
        code: 'AUTHENTICATION_FAILED',
        message: 'Invalid email or password.',
        status: 401,
      });
    }
    if (this.environment.EMAIL_VERIFICATION_REQUIRED && !user.emailVerifiedAt) {
      throw new ApiException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email address before logging in.',
        status: 403,
      });
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
    let user = await this.database.db.query.users.findFirst({
      where: eq(schema.users.googleId, googleId),
    });
    if (!user) {
      user = await this.database.db.query.users.findFirst({
        where: sql`lower(${schema.users.email}) = ${email.toLocaleLowerCase('en')}`,
      });
    }
    if (!user && !this.environment.REGISTRATION_ENABLED) {
      throw new ApiException({
        code: 'REGISTRATION_DISABLED',
        message: 'Registration is temporarily unavailable.',
        status: 503,
      });
    }
    if (user) {
      if (user.disabledAt) {
        throw new ApiException({
          code: 'AUTHENTICATION_FAILED',
          message: 'Account is disabled.',
          status: 401,
        });
      }
      if (!user.googleId || user.avatarUrl !== avatarUrl) {
        const rows = await this.database.db
          .update(schema.users)
          .set({ googleId, avatarUrl, emailVerifiedAt: user.emailVerifiedAt ?? new Date() })
          .where(eq(schema.users.id, user.id))
          .returning();
        if (!rows[0])
          throw new ApiException({
            code: 'INTERNAL_ERROR',
            message: 'User update failed.',
            status: 500,
          });
        user = rows[0];
      }
    } else {
      const rows = await this.database.db
        .insert(schema.users)
        .values({
          id: uuidv7(),
          email: email.toLocaleLowerCase('en'),
          displayName,
          googleId,
          avatarUrl,
          emailVerifiedAt: new Date(),
        })
        .returning();
      if (!rows[0])
        throw new ApiException({
          code: 'INTERNAL_ERROR',
          message: 'User creation failed.',
          status: 500,
        });
      user = rows[0];
    }
    if (!user)
      throw new ApiException({
        code: 'INTERNAL_ERROR',
        message: 'Authentication failed.',
        status: 500,
      });
    const workspace = await this.workspaceBootstrap.ensurePersonalWorkspace(user.id, displayName);
    return this.createSession(user, reply, workspace);
  }

  async verifyEmail(token: string, reply: FastifyReply) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const verification = await this.database.db.query.emailVerificationTokens.findFirst({
      where: eq(schema.emailVerificationTokens.tokenHash, tokenHash),
    });
    if (!verification || verification.usedAt || verification.expiresAt < new Date()) {
      throw new ApiException({
        code: 'VERIFICATION_TOKEN_INVALID',
        message: 'This verification link is invalid or expired.',
        status: 400,
      });
    }
    const verifiedAt = new Date();
    const user = await this.user(verification.userId);
    await this.database.db.transaction(async (transaction) => {
      const claimed = await transaction
        .update(schema.emailVerificationTokens)
        .set({ usedAt: verifiedAt })
        .where(
          and(
            eq(schema.emailVerificationTokens.id, verification.id),
            eq(schema.emailVerificationTokens.userId, user.id),
            isNull(schema.emailVerificationTokens.usedAt),
            gt(schema.emailVerificationTokens.expiresAt, verifiedAt),
          ),
        )
        .returning({ id: schema.emailVerificationTokens.id });
      if (!claimed[0]) {
        throw new ApiException({
          code: 'VERIFICATION_TOKEN_INVALID',
          message: 'This verification link is invalid or expired.',
          status: 400,
        });
      }
      await transaction
        .update(schema.users)
        .set({ emailVerifiedAt: verifiedAt, updatedAt: verifiedAt })
        .where(eq(schema.users.id, user.id));
    });
    const verifiedUser = { ...user, emailVerifiedAt: verifiedAt };
    const workspace = await this.workspaceBootstrap.ensurePersonalWorkspace(
      user.id,
      user.displayName,
    );
    await this.email.sendWelcome(user.email, user.displayName);
    return this.createSession(verifiedUser, reply, workspace);
  }

  async resendEmailVerification(email: string) {
    const normalizedEmail = email.trim().toLocaleLowerCase('en');
    const user = await this.database.db.query.users.findFirst({
      where: sql`lower(${schema.users.email}) = ${normalizedEmail}`,
    });
    if (user && !user.disabledAt && !user.emailVerifiedAt) await this.sendVerification(user);
    return { accepted: true };
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
    const resetUrl = `${this.environment.PUBLIC_WEB_URL}/reset-password?token=${token}`;
    await this.email.sendPasswordReset(email, resetUrl);
    return {
      accepted: true,
      ...(this.environment.NODE_ENV === 'development'
        ? { devToken: token, devResetLink: resetUrl }
        : {}),
    };
  }

  async resetPassword(token: string, password: string) {
    if (password.length < 12) {
      throw new ApiException({
        code: 'PASSWORD_TOO_WEAK',
        message: 'Password must be at least 12 characters.',
        status: 422,
      });
    }
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const reset = await this.database.db.query.passwordResetTokens.findFirst({
      where: eq(schema.passwordResetTokens.tokenHash, tokenHash),
    });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new ApiException({
        code: 'RESET_TOKEN_INVALID',
        message: 'Reset token is invalid or expired.',
        status: 400,
      });
    }
    await this.database.db.transaction(async (transaction) => {
      await transaction
        .update(schema.users)
        .set({
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
          updatedAt: new Date(),
        })
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
      emailVerified: Boolean(user.emailVerifiedAt),
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

  private async sendVerification(user: typeof schema.users.$inferSelect): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    await this.database.db.insert(schema.emailVerificationTokens).values({
      id: uuidv7(),
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    const verificationUrl = `${this.environment.PUBLIC_WEB_URL}/verify-email?token=${token}`;
    await this.email.sendEmailVerification(user.email, verificationUrl);
  }

  private async verifyTurnstile(token: string | undefined, remoteIp: string): Promise<void> {
    const secret = this.environment.TURNSTILE_SECRET_KEY;
    if (!secret) return;
    if (!token) {
      throw new ApiException({
        code: 'BOT_CHECK_REQUIRED',
        message: 'Complete the security check.',
        status: 422,
      });
    }
    const form = new URLSearchParams({ secret, response: token, remoteip: remoteIp });
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined);
    const result = response?.ok ? ((await response.json()) as { success?: boolean }) : undefined;
    if (!result?.success) {
      throw new ApiException({
        code: 'BOT_CHECK_FAILED',
        message: 'The security check failed. Please try again.',
        status: 422,
      });
    }
  }
}
