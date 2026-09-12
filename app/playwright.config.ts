import { defineConfig } from "@playwright/test";
import { PORT, E2E_DB_PATH } from "./e2e/constants.js";

export default defineConfig({
  testDir: "./e2e",
  // Tests share one SQLite database and deliberately build on each other's
  // state within a spec file (a realistic session, not isolated units), so
  // parallel workers would race and corrupt each other's expectations.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `rm -f ${E2E_DB_PATH} && DB_PATH=${E2E_DB_PATH} npm run db:migrate && DB_PATH=${E2E_DB_PATH} npm run db:seed && DB_PATH=${E2E_DB_PATH} PORT=${PORT} npx tsx src/server.ts`,
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
