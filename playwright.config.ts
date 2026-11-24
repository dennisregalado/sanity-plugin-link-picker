import {defineConfig, devices} from '@playwright/test'

/**
 * Browser smoke tests: the dev Studio (`npm run dev`) against a mocked Content Lake. Run with
 * `npm run test:e2e`; an already running dev Studio on port 3333 is reused.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 180_000,
  expect: {timeout: 30_000},
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:3333',
    viewport: {width: 1280, height: 1000},
    trace: 'off',
  },
  projects: [
    {name: 'chromium', use: {...devices['Desktop Chrome'], viewport: {width: 1280, height: 1000}}},
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3333',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
  },
})
