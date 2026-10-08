import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)) } },
  test: { environment: "node", maxWorkers: 1, testTimeout: 30000, hookTimeout: 30000, include: ["tests/**/*.test.ts"] },
});
