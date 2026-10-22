import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const systemChrome = process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined;
const executablePath = process.env.PLAYWRIGHT_CHROME_PATH ?? (systemChrome && fs.existsSync(systemChrome) ? systemChrome : undefined);

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry", launchOptions: executablePath ? { executablePath } : undefined },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
