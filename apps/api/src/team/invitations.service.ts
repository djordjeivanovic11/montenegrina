import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { schema } from '@montenegrina/database';
import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../core/api-exception.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestActor } from '../security/actor.js';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestActor) {
    const organizationId = this.organization(actor);
    const items = await this.database.db.query.invitations.findMany({
      where: eq(schema.invitations.organizationId, organizationId),
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        email: item.email,
        role: item.role,
        status: item.status,
        expiresAt: item.expiresAt.toISOString(),
        acceptedAt: item.acceptedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  async create(
    actor: RequestActor,
    body: { email: string; role?: 'ADMIN' | 'DEVELOPER' | 'VIEWER' },
    requestId: string,
  ) {
    const organizationId = this.organization(actor);
    const token = randomBytes(32).toString('base64url');
    const id = uuidv7();
    await this.database.db.insert(schema.invitations).values({
      id,
      organizationId,
      email: body.email.toLowerCase(),
      role: body.role ?? 'DEVELOPER',
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      invitedByUserId: actor.userId,
    });
    await this.audit.record({
      actor,
      action: 'invitation.created',
      resourceType: 'invitation',
      resourceId: id,
      requestId,
      after: { email: body.email, role: body.role ?? 'DEVELOPER' },
    });
    return { id, email: body.email, inviteToken: token };
  }

  async accept(token: string, userId: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invitation = await this.database.db.query.invitations.findFirst({
      where: and(eq(schema.invitations.tokenHash, tokenHash), eq(schema.invitations.status, 'PENDING')),
    });
    if (!invitation || invitation.expiresAt < new Date()) {
      throw new ApiException({ code: 'INVITATION_INVALID', message: 'Invitation is invalid or expired.', status: 400 });
    }
    const user = await this.database.db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ApiException({ code: 'INVITATION_EMAIL_MISMATCH', message: 'Invitation email does not match your account.', status: 403 });
    }
    await this.database.db.transaction(async (transaction) => {
      await transaction.insert(schema.memberships).values({
        organizationId: invitation.organizationId,
        userId,
        role: invitation.role,
      });
      await transaction
        .update(schema.invitations)
        .set({ status: 'ACCEPTED', acceptedAt: new Date() })
        .where(eq(schema.invitations.id, invitation.id));
    });
    return { organizationId: invitation.organizationId };
  }

  async revoke(actor: RequestActor, invitationId: string, requestId: string) {
    const organizationId = this.organization(actor);
    await this.database.db
      .update(schema.invitations)
      .set({ status: 'REVOKED' })
      .where(and(eq(schema.invitations.organizationId, organizationId), eq(schema.invitations.id, invitationId)));
    await this.audit.record({
      actor,
      action: 'invitation.revoked',
      resourceType: 'invitation',
      resourceId: invitationId,
      requestId,
    });
    return { id: invitationId, status: 'REVOKED' };
  }

  async listMembers(actor: RequestActor) {
    const organizationId = this.organization(actor);
    const memberships = await this.database.db.query.memberships.findMany({
      where: eq(schema.memberships.organizationId, organizationId),
    });
    const users = await Promise.all(
      memberships.map(async (membership) => {
        const user = await this.database.db.query.users.findFirst({
          where: eq(schema.users.id, membership.userId),
        });
        return {
          userId: membership.userId,
          role: membership.role,
          email: user?.email,
          displayName: user?.displayName,
          avatarUrl: user?.avatarUrl,
          joinedAt: membership.createdAt.toISOString(),
        };
      }),
    );
    return { items: users };
  }

  async updateMemberRole(actor: RequestActor, userId: string, role: (typeof schema.membershipRole.enumValues)[number], requestId: string) {
    const organizationId = this.organization(actor);
    if (userId === actor.userId) {
      throw new ApiException({ code: 'MEMBERSHIP_SELF_UPDATE', message: 'You cannot change your own role.', status: 422 });
    }
    await this.database.db
      .update(schema.memberships)
      .set({ role })
      .where(and(eq(schema.memberships.organizationId, organizationId), eq(schema.memberships.userId, userId)));
    await this.audit.record({
      actor,
      action: 'membership.updated',
      resourceType: 'membership',
      resourceId: userId,
      requestId,
      after: { role },
    });
    return { userId, role };
  }

  async removeMember(actor: RequestActor, userId: string, requestId: string) {
    const organizationId = this.organization(actor);
    if (userId === actor.userId) {
      throw new ApiException({ code: 'MEMBERSHIP_SELF_REMOVE', message: 'You cannot remove yourself.', status: 422 });
    }
    await this.database.db
      .delete(schema.memberships)
      .where(and(eq(schema.memberships.organizationId, organizationId), eq(schema.memberships.userId, userId)));
    await this.audit.record({
      actor,
      action: 'membership.removed',
      resourceType: 'membership',
      resourceId: userId,
      requestId,
    });
    return { userId, removed: true };
  }

  private organization(actor: RequestActor): string {
    if (!actor.organizationId) throw new ApiException({ code: 'ORGANIZATION_REQUIRED', message: 'Select an organization.', status: 400 });
    return actor.organizationId;
  }
}
