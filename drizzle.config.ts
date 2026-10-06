import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite", schema: "./src/db/schema.ts", out: "./src/db/migrations",
  // Generate only. Application persistence/connection is deliberately a Day 2 task.
});
