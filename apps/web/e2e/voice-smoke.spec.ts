import { expect, test } from '@playwright/test';

const voiceSmokeEnabled = process.env.VOICE_SMOKE === '1';
const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:3001';
const sessionCookie = process.env.VOICE_SMOKE_SESSION_COOKIE;
const googleCredential = process.env.VOICE_SMOKE_GOOGLE_CREDENTIAL;
const googleEmail = process.env.VOICE_SMOKE_GOOGLE_EMAIL ?? 'smoke@montenegrina.local';
const cyrillicPattern = /[\u0400-\u04ff]/;

test.skip(!voiceSmokeEnabled, 'VOICE_SMOKE=1 enables the deployed voice MVP smoke test.');

function fakeGoogleCredential(email: string): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return [
    encode({ alg: 'none', typ: 'JWT' }),
    encode({ sub: `smoke-${email}`, email, name: 'Voice Smoke' }),
    'signature',
  ].join('.');
}

test('production voice MVP emits assistant audio and Latin transcript', async ({
  context,
  page,
}) => {
  test.skip(
    !sessionCookie && !googleCredential && !process.env.VOICE_SMOKE_ALLOW_FAKE_GOOGLE,
    'Set VOICE_SMOKE_SESSION_COOKIE, VOICE_SMOKE_GOOGLE_CREDENTIAL, or VOICE_SMOKE_ALLOW_FAKE_GOOGLE=1.',
  );

  if (sessionCookie) {
    await context.addCookies([
      {
        name: 'montenegrina_session',
        value: sessionCookie,
        url: apiUrl,
        httpOnly: true,
        secure: apiUrl.startsWith('https://'),
        sameSite: 'Lax',
      },
    ]);
  } else {
    const credential =
      googleCredential ??
      (process.env.VOICE_SMOKE_ALLOW_FAKE_GOOGLE ? fakeGoogleCredential(googleEmail) : '');
    const login = await page.request.post(`${apiUrl}/v1/auth/google`, {
      data: { credential },
    });
    expect(login.ok()).toBeTruthy();
  }

  const me = await page.request.get(`${apiUrl}/v1/auth/me`);
  expect(me.ok()).toBeTruthy();
  const session = (await me.json()) as {
    csrfToken?: string;
    organizations?: Array<{ id: string }>;
  };
  expect(session.csrfToken).toBeTruthy();
  expect(session.organizations?.[0]?.id).toBeTruthy();

  await page.addInitScript(
    (organizationId) => {
      window.localStorage.setItem('montenegrina-org-id', organizationId);
    },
    session.organizations?.[0]?.id,
  );

  await page.goto('/playground');
  await page.getByRole('button', { name: 'Otvori DevPanel' }).click();
  const startVoice = page.getByLabel('Pokreni glasovnu sesiju').first();
  await expect(startVoice).toBeEnabled({ timeout: 20_000 });
  await startVoice.click();

  const devPanel = page.getByRole('dialog', { name: /Dev Panel/i });
  await expect(devPanel).toContainText('session.started', { timeout: 30_000 });
  await expect(devPanel).toContainText('assistant.text.completed', { timeout: 60_000 });
  await expect(devPanel).toContainText('assistant.audio.started', { timeout: 60_000 });
  await expect(page.getByTestId('remote-audio-track').first()).toBeAttached({ timeout: 60_000 });

  const transcript = await page.getByTestId('message-assistant-content').first().innerText({
    timeout: 60_000,
  });
  expect(transcript).not.toMatch(cyrillicPattern);
});
