import { defineConfig } from '@playwright/test';

const launchArgs = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
];

if (process.env.VOICE_SMOKE_AUDIO_FILE) {
  launchArgs.push(`--use-file-for-fake-audio-capture=${process.env.VOICE_SMOKE_AUDIO_FILE}`);
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    permissions: ['microphone'],
    launchOptions: {
      args: launchArgs,
    },
  },
});
