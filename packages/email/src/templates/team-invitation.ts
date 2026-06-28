export function teamInvitationTemplate(
  inviteUrl: string,
  organizationName: string,
): { subject: string; html: string; text: string } {
  const subject = `You've been invited to ${organizationName} on Montenegrina`;
  const text = [
    `You've been invited to join "${organizationName}" on Montenegrina.`,
    '',
    `Accept invitation: ${inviteUrl}`,
    '',
    'This invitation expires in 7 days.',
    '',
    '— Montenegrina / Montenegrina — glasovni AI za Crnu Goru',
  ].join('\n');
  const html = `<!DOCTYPE html>
<html><body style="font-family:sans-serif;line-height:1.5;color:#111">
<p>You've been invited to join <strong>${organizationName}</strong> on Montenegrina.</p>
<p><a href="${inviteUrl}">Accept invitation</a></p>
<p style="color:#666;font-size:14px">This invitation expires in 7 days.</p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
<p style="color:#888;font-size:12px">Montenegrina — glasovni AI za Crnu Goru</p>
</body></html>`;
  return { subject, html, text };
}
