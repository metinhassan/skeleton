import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Tests share database state
  reporter: 'html',
  use: {
    baseURL: 'https://localhost:3000',
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'https://localhost:3000',
    reuseExistingServer: !process.env.CI,
    ignoreHTTPSErrors: true,
    timeout: 30000,
  },
});
