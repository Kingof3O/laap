import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/remediation",
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:1423", headless: true },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 1423 --mode studio",
    url: "http://127.0.0.1:1423",
    env: { VITE_COMMUNITY_RELAY_URL: "ws://127.0.0.1:4175/v1/rooms/events" },
    reuseExistingServer: false,
  },
});
