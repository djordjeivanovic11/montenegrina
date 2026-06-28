import { Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { jwtVerify, SignJWT } from 'jose';

import { ENVIRONMENT } from '../core/tokens.js';

export interface RuntimeClaims {
  organizationId: string;
  agentId: string;
  agentVersionId: string;
  conversationId: string;
}

@Injectable()
export class InternalTokenService {
  readonly #secret: Uint8Array;
  readonly #lifetime: string;

  constructor(@Inject(ENVIRONMENT) environment: Environment) {
    this.#secret = new TextEncoder().encode(environment.INTERNAL_TOKEN_SECRET);
    this.#lifetime = `${environment.MAX_CONVERSATION_MINUTES + 5}m`;
  }

  issue(claims: RuntimeClaims): Promise<string> {
    return new SignJWT({ ...claims, scope: 'runtime' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.conversationId)
      .setIssuer('montenegrina-api')
      .setAudience('montenegrina-voice-agent')
      .setIssuedAt()
      .setExpirationTime(this.#lifetime)
      .sign(this.#secret);
  }

  async verify(token: string): Promise<RuntimeClaims> {
    const { payload } = await jwtVerify(token, this.#secret, {
      issuer: 'montenegrina-api',
      audience: 'montenegrina-voice-agent',
    });
    if (
      payload.scope !== 'runtime' ||
      typeof payload.organizationId !== 'string' ||
      typeof payload.agentId !== 'string' ||
      typeof payload.agentVersionId !== 'string' ||
      typeof payload.conversationId !== 'string'
    ) {
      throw new Error('Invalid runtime token claims');
    }
    return {
      organizationId: payload.organizationId,
      agentId: payload.agentId,
      agentVersionId: payload.agentVersionId,
      conversationId: payload.conversationId,
    };
  }
}
