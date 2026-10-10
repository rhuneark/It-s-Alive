import { defineConfig } from '@playwright/test';

// Full playthrough against the dev server (SDK in mock mode, ?day=N time travel).
export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5199',
    launchOptions: { executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' },
    deviceScaleFactor: 2,
    hasTouch: true,
  },
  projects: [
    { name: 'iphone-se-375x667', use: { viewport: { width: 375, height: 667 } } },
    { name: 'iphone-14-390x844', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'npx vite --port 5199 --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
