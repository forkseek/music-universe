import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { openDatabase } from "../src/db/connection";

const context = await openDatabase();
try {
  // A temporary table checks writes without touching users or their libraries.
  await context.db.transaction(async (tx) => {
    await tx.execute(sql`CREATE TEMP TABLE storage_probe (value text NOT NULL) ON COMMIT DROP`);
    await tx.execute(sql`INSERT INTO storage_probe VALUES ('round-trip')`);
    const result = await tx.select({ value: sql<string>`value` }).from(sql`storage_probe`);
    assert.equal(result[0]?.value, "round-trip");
  });
  console.log(JSON.stringify({ storage: "postgresql", readable: true, writable: true, migrations: "applied" }));
} finally {
  await context.close();
}
