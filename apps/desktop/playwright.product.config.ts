import { defineConfig } from '@playwright/test'

const flavor = process.env.LAAP_TEST_FLAVOR === 'complete' ? 'complete' : 'studio'
const port = flavor === 'complete' ? 1424 : 1423

export default defineConfig({
  testDir: './tests/product',
  use: { baseURL: 'http://127.0.0.1:' + port, viewport: { width: 1160, height: 760 } },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port ' + port + ' --mode ' + flavor,
    url: 'http://127.0.0.1:' + port,
  },
})
