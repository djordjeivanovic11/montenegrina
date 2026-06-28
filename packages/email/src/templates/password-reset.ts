export function passwordResetTemplate(resetUrl: string): { subject: string; html: string; text: string } {
  const subject = 'Reset your Montenegrina password';
  const text = [
    'You requested a password reset for your Montenegrina account.',
    '',
    `Reset your password: ${resetUrl}`,
    '',
    'This link expires in 1 hour. If you did not request this, you can ignore this email.',
    '',
    '— Montenegrina / Montenegrina — glasovni AI za Crnu Goru',
  ].join('\n');
  const html = `<!DOCTYPE html>
<html><body style="font-family:sans-serif;line-height:1.5;color:#111">
<p>You requested a password reset for your Montenegrina account.</p>
<p><a href="${resetUrl}">Reset your password</a></p>
<p style="color:#666;font-size:14px">This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
<p style="color:#888;font-size:12px">Montenegrina — glasovni AI za Crnu Goru</p>
</body></html>`;
  return { subject, html, text };
}
