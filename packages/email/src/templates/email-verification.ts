export function emailVerificationTemplate(verificationUrl: string) {
  return {
    subject: 'Verify your Montenegrina account',
    html: `<p>Welcome to Montenegrina.</p><p><a href="${verificationUrl}">Verify your email address</a></p><p>This link expires in 30 minutes.</p>`,
    text: `Welcome to Montenegrina. Verify your email address: ${verificationUrl}\n\nThis link expires in 30 minutes.`,
  };
}
