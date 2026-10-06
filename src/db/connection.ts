import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export function openDatabase(filename: string) {
  if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
  const sqlite = new Database(filename, { timeout: 5_000 });
  try {
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = FULL");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: path.join(process.cwd(), "src/db/migrations") });
    return { db, sqlite, filename };
  } catch (error) { sqlite.close(); throw error; }
}
export type DatabaseContext = ReturnType<typeof openDatabase>;

const globalDatabase = globalThis as typeof globalThis & { musicWorldDatabase?: DatabaseContext };
export function getDatabase(): DatabaseContext {
  if (globalDatabase.musicWorldDatabase) return globalDatabase.musicWorldDatabase;
  const configured = process.env.DATABASE_PATH ?? process.env.DATABASE_URL?.replace(/^file:/u, "") ?? "./data/music-world.db";
  if (configured === ":memory:" || /^(https?|libsql):/u.test(configured)) throw new Error("DATABASE_PATH 必须指向持久化 SQLite 文件。");
  // Runtime storage is provisioned separately; never bundle database files.
  globalDatabase.musicWorldDatabase = openDatabase(path.resolve(/* turbopackIgnore: true */ configured));
  return globalDatabase.musicWorldDatabase;
}
