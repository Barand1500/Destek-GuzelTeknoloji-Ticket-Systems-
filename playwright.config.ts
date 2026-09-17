import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: "backend/.env", quiet: true });
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(".local/playwright");
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "off",
    actionTimeout: 15000,
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
