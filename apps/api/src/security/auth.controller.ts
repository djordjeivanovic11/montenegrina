import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { schema } from '@montenegrina/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { ENVIRONMENT } from '../core/tokens.js';
import { ApiException } from '../core/api-exception.js';
import { DatabaseService } from '../database/database.service.js';
import { Public } from './public.decorator.js';
import { SessionService } from './session.service.js';
import { CurrentActor } from './current-actor.decorator.js';
import type { RequestActor } from './actor.js';

const normalizedEmail = z
  .email()
  .max(320)
  .transform((value) => value.trim().toLocaleLowerCase('en'));
const registerSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(12).max(256),
  displayName: z.string().trim().min(2).max(100),
  turnstileToken: z.string().min(1).max(4096).optional(),
});
const loginSchema = z.object({ email: normalizedEmail, password: z.string().min(1).max(256) });
const tokenSchema = z.object({ token: z.string().min(32).max(256) });
const emailSchema = z.object({ email: normalizedEmail });
const resetPasswordSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(256),
});
const googleCredentialSchema = z.object({ credential: z.string().min(1).max(16_384) });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiException({
      code: 'VALIDATION_FAILED',
      message: 'The request body is invalid.',
      status: 422,
    });
  }
  return result.data;
}

@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly database: DatabaseService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(202)
  register(
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const body = parse(registerSchema, rawBody);
    return this.sessions.register(
      body.email,
      body.password,
      body.displayName,
      body.turnstileToken,
      request.ip,
      reply,
    );
  }

  @Public()
  @Post('login')
  login(@Body() rawBody: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const body = parse(loginSchema, rawBody);
    return this.sessions.login(body.email, body.password, reply);
  }

  @Public()
  @Post('verify-email')
  verifyEmail(@Body() rawBody: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const body = parse(tokenSchema, rawBody);
    return this.sessions.verifyEmail(body.token, reply);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(202)
  resendVerification(@Body() rawBody: unknown) {
    const body = parse(emailSchema, rawBody);
    return this.sessions.resendEmailVerification(body.email);
  }

  @Post('logout')
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.sessions.logout(request.cookies.montenegrina_session, reply);
    reply.status(204);
  }

  @Get('me')
  async me(@CurrentActor() actor: RequestActor) {
    const user = await this.sessions.user(actor.userId ?? actor.actorId);
    const memberships = await this.database.db.query.memberships.findMany({
      where: eq(schema.memberships.userId, user.id),
    });
    const organizations = memberships.length
      ? await Promise.all(
          memberships.map(async (membership) => {
            const organization = await this.database.db.query.organizations.findFirst({
              where: eq(schema.organizations.id, membership.organizationId),
            });
            const onboarding = await this.database.db.query.organizationOnboarding.findFirst({
              where: eq(schema.organizationOnboarding.organizationId, membership.organizationId),
            });
            return organization
              ? {
                  id: organization.id,
                  name: organization.name,
                  slug: organization.slug,
                  role: membership.role,
                  onboarding: onboarding
                    ? {
                        currentStep: onboarding.currentStep,
                        completedAt: onboarding.completedAt?.toISOString() ?? null,
                        isComplete:
                          onboarding.currentStep === 'COMPLETED' || Boolean(onboarding.completedAt),
                      }
                    : { currentStep: 'COMPLETED', completedAt: null, isComplete: true },
                }
              : undefined;
          }),
        )
      : [];
    return {
      user: this.sessions.safeUser(user),
      csrfToken: actor.csrfToken ?? '',
      organizations: organizations.filter(Boolean),
    };
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() rawBody: unknown) {
    const body = parse(emailSchema, rawBody);
    return this.sessions.forgotPassword(body.email);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() rawBody: unknown) {
    const body = parse(resetPasswordSchema, rawBody);
    return this.sessions.resetPassword(body.token, body.password);
  }

  @Public()
  @Post('google')
  async googleLogin(@Body() rawBody: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const body = parse(googleCredentialSchema, rawBody);
    const googleClientId = this.environment.GOOGLE_CLIENT_ID;
    let googleId: string;
    let email: string;
    let displayName: string;
    let avatarUrl: string | undefined;

    if (googleClientId) {
      const client = new OAuth2Client(googleClientId);
      let ticket;
      try {
        ticket = await client.verifyIdToken({ idToken: body.credential, audience: googleClientId });
      } catch {
        throw new ApiException({
          code: 'AUTHENTICATION_FAILED',
          message: 'Invalid Google credential.',
          status: 401,
        });
      }
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) {
        throw new ApiException({
          code: 'AUTHENTICATION_FAILED',
          message: 'Invalid Google credential payload.',
          status: 401,
        });
      }
      googleId = payload.sub;
      email = payload.email.trim().toLocaleLowerCase('en');
      displayName = payload.name ?? payload.email;
      avatarUrl = payload.picture;
    } else {
      const parts = body.credential.split('.');
      if (parts.length !== 3) {
        throw new ApiException({
          code: 'AUTHENTICATION_FAILED',
          message: 'Invalid credential format.',
          status: 401,
        });
      }
      const payloadJson = Buffer.from(parts[1] ?? '', 'base64url').toString('utf8');
      const payload = JSON.parse(payloadJson) as {
        sub?: string;
        email?: string;
        name?: string;
        picture?: string;
      };
      if (!payload.sub || !payload.email) {
        throw new ApiException({
          code: 'AUTHENTICATION_FAILED',
          message: 'Invalid Google credential payload.',
          status: 401,
        });
      }
      googleId = payload.sub;
      email = payload.email.trim().toLocaleLowerCase('en');
      displayName = payload.name ?? payload.email;
      avatarUrl = payload.picture;
    }

    return this.sessions.loginWithGoogle(
      { googleId, email, displayName, ...(avatarUrl ? { avatarUrl } : {}) },
      reply,
    );
  }
}
