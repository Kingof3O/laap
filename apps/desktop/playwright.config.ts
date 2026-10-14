import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/ui',
  testIgnore: ['**/._*'],
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:1422', headless: true },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 1422 --mode offline',
    url: 'http://127.0.0.1:1422',
    reuseExistingServer: false,
  },
})
