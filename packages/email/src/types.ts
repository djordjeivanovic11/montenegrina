export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailService {
  sendEmailVerification(to: string, verificationUrl: string): Promise<void>;
  sendPasswordReset(to: string, resetUrl: string): Promise<void>;
  sendTeamInvitation(to: string, inviteUrl: string, organizationName: string): Promise<void>;
  sendWelcome(to: string, displayName: string): Promise<void>;
}
