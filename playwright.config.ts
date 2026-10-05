import { defineConfig, devices } from "@playwright/test";
import { migrateTempDb } from "./scripts/with-temp-db";

// A fresh, migrated, throwaway database for the whole e2e run (see
// tech-docs/database.md); its process.exit cleanup is best-effort.
const tempDb = migrateTempDb();
process.on("exit", tempDb.cleanup);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: { DATABASE_URL: tempDb.url },
  },
});
