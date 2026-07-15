import type { EmailService } from '../types.js';
import { emailVerificationTemplate } from '../templates/email-verification.js';
import { passwordResetTemplate } from '../templates/password-reset.js';
import { teamInvitationTemplate } from '../templates/team-invitation.js';
import { welcomeTemplate } from '../templates/welcome.js';

export class ResendEmailProvider implements EmailService {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async sendEmailVerification(to: string, verificationUrl: string): Promise<void> {
    const message = emailVerificationTemplate(verificationUrl);
    await this.send(to, message.subject, message.html, message.text);
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const message = passwordResetTemplate(resetUrl);
    await this.send(to, message.subject, message.html, message.text);
  }

  async sendTeamInvitation(to: string, inviteUrl: string, organizationName: string): Promise<void> {
    const message = teamInvitationTemplate(inviteUrl, organizationName);
    await this.send(to, message.subject, message.html, message.text);
  }

  async sendWelcome(to: string, displayName: string): Promise<void> {
    const message = welcomeTemplate(displayName);
    await this.send(to, message.subject, message.html, message.text);
  }

  private async send(to: string, subject: string, html: string, text: string): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, to: [to], subject, html, text }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend API error (${response.status}): ${body.slice(0, 500)}`);
    }
  }
}
