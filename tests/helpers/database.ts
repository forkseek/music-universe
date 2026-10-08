import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { DatabaseContext } from "@/db/connection";
import * as schema from "@/db/schema";

/** Real PostgreSQL engine for isolated tests; never used as a runtime cloud fallback. */
export async function openDatabase(filename = ":memory:"): Promise<DatabaseContext & { filename: string }> {
  const client = new PGlite(filename === ":memory:" ? undefined : filename);
  try {
    await client.waitReady;
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: "src/db/postgres-migrations" });
    let closed = false;
    return { db, filename, get closed() { return closed; },
      async close() { if (!closed) { closed = true; await client.close(); } } };
  } catch (error) { await client.close(); throw error; }
}
