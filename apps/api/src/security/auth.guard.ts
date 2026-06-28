import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { schema } from '@montenegrina/database';
import argon2 from 'argon2';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';

import { ApiException } from '../core/api-exception.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from './actor.js';
import { PERMISSIONS } from './permissions.decorator.js';
import { PUBLIC_ROUTE } from './public.decorator.js';
import { SessionService } from './session.service.js';

const rolePermissions: Record<string, string[]> = {
  OWNER: ['*'],
  ADMIN: ['agents:*', 'knowledge:*', 'tools:*', 'evaluations:*', 'usage:read', 'memberships:*', 'api-keys:*', 'organizations:*', 'billing:read'],
  DEVELOPER: ['agents:*', 'knowledge:*', 'tools:*', 'evaluations:*', 'usage:read', 'conversations:*', 'organizations:read', 'billing:read'],
  VIEWER: ['agents:read', 'knowledge:read', 'tools:read', 'evaluations:read', 'usage:read', 'conversations:read', 'organizations:read', 'billing:read'],
};

function permissionMatches(granted: string, required: string): boolean {
  return granted === '*' || granted === required || (granted.endsWith(':*') && required.startsWith(granted.slice(0, -1)));
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const actor = await this.authenticate(request);
    request.actor = actor;

    if (actor.actorType === 'USER' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const token = request.headers['x-csrf-token'];
      if (!this.sessions.csrfMatches(actor.csrfToken ?? '', typeof token === 'string' ? token : undefined)) {
        throw new ApiException({ code: 'CSRF_TOKEN_INVALID', message: 'A valid CSRF token is required.', status: 403 });
      }
    }

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS, [context.getHandler(), context.getClass()]) ?? [];
    for (const permission of required) {
      if (![...actor.permissions].some((granted) => permissionMatches(granted, permission))) {
        throw new ApiException({ code: 'PERMISSION_DENIED', message: 'The actor lacks the required permission.', status: 403 });
      }
    }
    return true;
  }

  private async authenticate(request: FastifyRequest): Promise<RequestActor> {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer mg_')) return this.authenticateApiKey(authorization.slice(7));

    const sessionId = request.cookies.montenegrina_session;
    if (!sessionId) {
      throw new ApiException({ code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.', status: 401 });
    }
    const session = await this.sessions.get(sessionId);
    if (!session) {
      throw new ApiException({ code: 'SESSION_EXPIRED', message: 'The session has expired.', status: 401 });
    }
    await this.sessions.user(session.userId);
    const memberships = await this.database.db.query.memberships.findMany({
      where: eq(schema.memberships.userId, session.userId),
    });
    const requestedOrganization = request.headers['x-organization-id'];
    const organizationId =
      typeof requestedOrganization === 'string'
        ? requestedOrganization
        : memberships.length === 1
          ? memberships[0]?.organizationId
          : undefined;
    const membership = organizationId
      ? memberships.find((candidate) => candidate.organizationId === organizationId)
      : undefined;
    if (organizationId && !membership) {
      throw new ApiException({ code: 'TENANT_ACCESS_DENIED', message: 'The organization is not accessible.', status: 403 });
    }
    return {
      actorType: 'USER',
      actorId: session.userId,
      userId: session.userId,
      ...(organizationId ? { organizationId } : {}),
      permissions: new Set(membership ? rolePermissions[membership.role] : []),
      csrfToken: session.csrfToken,
    };
  }

  private async authenticateApiKey(raw: string): Promise<RequestActor> {
    const separator = raw.indexOf('.');
    if (separator < 1) throw this.invalidApiKey();
    const prefix = raw.slice(0, separator);
    const secret = raw.slice(separator + 1);
    const now = new Date();
    const key = await this.database.db.query.apiKeys.findFirst({
      where: and(
        eq(schema.apiKeys.prefix, prefix),
        isNull(schema.apiKeys.revokedAt),
        or(isNull(schema.apiKeys.expiresAt), gt(schema.apiKeys.expiresAt, now)),
      ),
    });
    if (!key || !(await argon2.verify(key.secretHash, secret))) throw this.invalidApiKey();
    void this.database.db.update(schema.apiKeys).set({ lastUsedAt: now }).where(eq(schema.apiKeys.id, key.id));
    return {
      actorType: 'API_KEY',
      actorId: key.id,
      apiKeyId: key.id,
      organizationId: key.organizationId,
      permissions: new Set(key.permissions),
    };
  }

  private invalidApiKey(): ApiException {
    return new ApiException({ code: 'API_KEY_INVALID', message: 'The API key is invalid.', status: 401 });
  }
}
