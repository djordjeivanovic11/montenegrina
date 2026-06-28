export function welcomeTemplate(displayName: string): { subject: string; html: string; text: string } {
  const subject = 'Welcome to Montenegrina';
  const text = [
    `Hi ${displayName},`,
    '',
    'Welcome to Montenegrina! Your workspace is ready.',
    '',
    '— Montenegrina',
  ].join('\n');
  const html = `<!DOCTYPE html>
<html><body style="font-family:sans-serif;line-height:1.5;color:#111">
<p>Hi ${displayName},</p>
<p>Welcome to Montenegrina! Your workspace is ready.</p>
</body></html>`;
  return { subject, html, text };
}
