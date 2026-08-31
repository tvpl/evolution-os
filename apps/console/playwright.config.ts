import { defineConfig } from "@playwright/test";

const HUB_PORT = 4010;
const CONSOLE_PORT = 4011;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${CONSOLE_PORT}`,
    // Chromium pré-instalado do ambiente (PLAYWRIGHT_BROWSERS_PATH).
    launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
  },
  webServer: [
    {
      command: "pnpm --filter @evolution-os/hub dev",
      url: `http://127.0.0.1:${HUB_PORT}/healthz`,
      reuseExistingServer: false,
      timeout: 60_000,
      cwd: "../..",
      env: { PORT: String(HUB_PORT) },
    },
    {
      command: "pnpm dev",
      url: `http://127.0.0.1:${CONSOLE_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { HUB_URL: `http://127.0.0.1:${HUB_PORT}` },
    },
  ],
});
