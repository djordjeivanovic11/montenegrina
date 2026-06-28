import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { Public } from './public.decorator.js';
import { SessionService } from './session.service.js';
import { CurrentActor } from './current-actor.decorator.js';
import type { RequestActor } from './actor.js';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly sessions: SessionService) {}

  @Public()
  @Post('login')
  login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.sessions.login(body.email, body.password, reply);
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
    return { user: this.sessions.safeUser(user), csrfToken: actor.csrfToken ?? '' };
  }
}

