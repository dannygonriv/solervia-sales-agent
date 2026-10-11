import { defineConfig, devices } from "@playwright/test";
import { scryptSync } from "node:crypto";
const salt = "e2e-solervia-private-test-salt";
const passwordHash =
  salt + ":" + scryptSync("Test-only-password-2026", salt, 64).toString("hex");
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      APP_URL: "http://127.0.0.1:3100",
      APP_ENV: "local",
      LOCAL_DATABASE_PATH: ".data/e2e-" + Date.now(),
      ADMIN_EMAIL: "test@example.invalid",
      ADMIN_PASSWORD_HASH: passwordHash,
      LIVE_ACTIONS_ENABLED: "false",
      COMPLIANCE_REVIEWED: "false",
    },
  },
});
