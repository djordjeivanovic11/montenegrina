import { expect, test } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:3001';

test('API health live returns 200', async ({ request }) => {
  const response = await request.get(`${apiUrl}/health/live`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { status: string };
  expect(body.status).toBe('ok');
});

test('Login with seeded admin reaches overview', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email|e-pošta/i).fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@montenegrina.local');
  await page.getByLabel(/password|lozinka/i).fill(process.env.E2E_ADMIN_PASSWORD ?? 'local-admin-change-me');
  await page.getByRole('button', { name: /log in|prijavi/i }).click();
  await page.waitForURL(/\/(overview|onboarding)/, { timeout: 15_000 });
});

test('Register lands on onboarding', async ({ page }) => {
  const email = `e2e-${Date.now()}@montenegrina.local`;
  await page.goto('/signup');
  await page.getByLabel(/display name|ime/i).fill('E2E User');
  await page.getByLabel(/email|e-pošta/i).fill(email);
  await page.getByLabel(/password|lozinka/i).fill('local-test-password-12');
  await page.getByRole('button', { name: /create account|kreiraj/i }).click();
  await page.waitForURL(/\/onboarding/, { timeout: 15_000 });
});
