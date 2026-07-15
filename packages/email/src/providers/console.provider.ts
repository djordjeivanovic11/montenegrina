import type { EmailService } from '../types.js';
import { emailVerificationTemplate } from '../templates/email-verification.js';
import { passwordResetTemplate } from '../templates/password-reset.js';
import { teamInvitationTemplate } from '../templates/team-invitation.js';
import { welcomeTemplate } from '../templates/welcome.js';

export class ConsoleEmailProvider implements EmailService {
  constructor(private readonly from: string) {}

  sendEmailVerification(to: string, verificationUrl: string): Promise<void> {
    const message = emailVerificationTemplate(verificationUrl);
    this.log('email-verification', to, message, verificationUrl);
    return Promise.resolve();
  }

  sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const message = passwordResetTemplate(resetUrl);
    this.log('password-reset', to, message, resetUrl);
    return Promise.resolve();
  }

  sendTeamInvitation(to: string, inviteUrl: string, organizationName: string): Promise<void> {
    const message = teamInvitationTemplate(inviteUrl, organizationName);
    this.log('team-invitation', to, message, inviteUrl);
    return Promise.resolve();
  }

  sendWelcome(to: string, displayName: string): Promise<void> {
    const message = welcomeTemplate(displayName);
    this.log('welcome', to, message);
    return Promise.resolve();
  }

  private log(
    kind: string,
    to: string,
    message: { subject: string; html: string; text: string },
    link?: string,
  ): void {
    process.stdout.write(
      `[email:${kind}] to=${to} from=${this.from} subject="${message.subject}"${link ? ` link=${link}` : ''}\n`,
    );
  }
}
