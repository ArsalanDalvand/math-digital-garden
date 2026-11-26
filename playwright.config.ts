import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

function resolveLocalChromium(): string | undefined {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;

  const cacheRoot = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fs.existsSync(cacheRoot)) return undefined;

  const dirs = fs
    .readdirSync(cacheRoot)
    .filter((entry) => entry.startsWith('chromium-'))
    .sort()
    .reverse();

  for (const dir of dirs) {
    for (const subdir of ['chrome-linux64', 'chrome-linux']) {
      const candidate = path.join(cacheRoot, dir, subdir, 'chrome');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

const executablePath = resolveLocalChromium();
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4321';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'fa-IR',
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
});
