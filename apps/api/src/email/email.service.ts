import { Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { createEmailService, type EmailService } from '@montenegrina/email';

import { ENVIRONMENT } from '../core/tokens.js';

export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');

@Injectable()
export class EmailServiceWrapper {
  readonly service: EmailService;

  constructor(@Inject(ENVIRONMENT) environment: Environment) {
    this.service = createEmailService(environment);
  }

  sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    return this.service.sendPasswordReset(to, resetUrl);
  }

  sendTeamInvitation(to: string, inviteUrl: string, organizationName: string): Promise<void> {
    return this.service.sendTeamInvitation(to, inviteUrl, organizationName);
  }

  sendWelcome(to: string, displayName: string): Promise<void> {
    return this.service.sendWelcome(to, displayName);
  }
}
