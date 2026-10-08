import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "", MUSIC_CREDENTIAL_SECRET: "browser-test-key-not-used-in-production", MUSIC_DESKTOP_LOGIN: "0", NEXT_DIST_DIR: ".next-test", APP_ORIGIN: "http://127.0.0.1:3100",
      AI_PROVIDER: "none", AI_API_KEY: "", NEXT_PUBLIC_ENABLE_QQMUSIC: process.env.NEXT_PUBLIC_ENABLE_QQMUSIC ?? "false" },
    timeout: 120_000,
  },
});
