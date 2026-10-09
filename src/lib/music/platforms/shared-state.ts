import "server-only";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDatabase, type DatabaseContext } from "@/db/connection";
import { musicRateLimits as rates, musicRuntimeState as state } from "@/db/schema";
import { seal, unseal } from "./vault";

const capacities = { catalog: 1000, media: 32, "qq-media": 32, qr: 4, oauth: 1, refresh: 1, rate: 16 } as const;
export type StateNamespace = keyof typeof capacities;
export interface StateEntry<T> { value: T; expiresAt: number }
const scope = (userId: string, namespace: StateNamespace) => and(eq(state.userId, userId), eq(state.namespace, namespace));
const identity = (userId: string, namespace: StateNamespace, key: string) => and(scope(userId, namespace), eq(state.key, key));
const contextKey = (userId: string, namespace: StateNamespace, key: string) => JSON.stringify(["runtime", userId, namespace, key]);

async function read<T>(db: DatabaseContext, userId: string, namespace: StateNamespace, key: string) {
  const row = (await db.db.select().from(state).where(identity(userId, namespace, key)))[0];
  if (!row) return null;
  try { return { value: unseal<T>(row.payload, contextKey(userId, namespace, key)), expiresAt: row.expiresAt.getTime() }; }
  catch { return null; }
}
export async function readState<T>(userId: string, namespace: StateNamespace, key: string, includeExpired = false): Promise<StateEntry<T> | null> {
  const result = await read<T>(await getDatabase(), userId, namespace, key);
  return result && (includeExpired || result.expiresAt > Date.now()) ? result : null;
}

/** Serialize only the brief state transition, not the upstream network operation. */
export async function mutateState<T, R>(userId: string, namespace: StateNamespace, key: string,
  change: (current: StateEntry<T> | null, db: DatabaseContext) => Promise<{ entry?: StateEntry<T> | null; result: R }> | { entry?: StateEntry<T> | null; result: R }): Promise<R> {
  const db = await getDatabase();
  return db.db.transaction(async transaction => {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([userId, namespace])}, 0))`);
    const context = { ...db, db: transaction };
    const next = await change(await read<T>(context, userId, namespace, key), context);
    if (next.entry === null) await transaction.delete(state).where(identity(userId, namespace, key));
    else if (next.entry) await write(context, userId, namespace, [{ key, ...next.entry }]);
    return next.result;
  });
}

async function write(db: DatabaseContext, userId: string, namespace: StateNamespace, entries: (StateEntry<unknown> & { key: string })[]) {
  // Indexed expiry cleanup also prevents old QR sessions and search pages accumulating forever.
  await db.db.delete(state).where(lte(state.expiresAt, new Date()));
  await db.db.insert(state).values(entries.map(entry => ({ userId, namespace, key: entry.key,
    payload: seal(entry.value, contextKey(userId, namespace, entry.key)), expiresAt: new Date(entry.expiresAt), updatedAt: new Date() })))
    .onConflictDoUpdate({ target: [state.userId, state.namespace, state.key], set: {
      payload: sql`excluded.payload`, expiresAt: sql`excluded.expires_at`, updatedAt: sql`excluded.updated_at`,
    } });
  const extra = await db.db.select({ key: state.key }).from(state).where(scope(userId, namespace))
    .orderBy(desc(state.updatedAt), desc(state.key)).offset(capacities[namespace]);
  if (extra.length) await db.db.delete(state).where(and(scope(userId, namespace), inArray(state.key, extra.map(row => row.key))));
}
export async function putStates(userId: string, namespace: StateNamespace, entries: (StateEntry<unknown> & { key: string })[]) {
  if (!entries.length) return;
  if (entries.length > capacities[namespace]) throw new Error("Runtime state batch exceeds its capacity");
  const db = await getDatabase();
  await db.db.transaction(async transaction => {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([userId, namespace])}, 0))`);
    await write({ ...db, db: transaction }, userId, namespace, entries);
  });
}
export async function deleteStates(userId: string, namespace: StateNamespace, predicate?: (value: unknown) => boolean) {
  const db = await getDatabase();
  await db.db.transaction(async transaction => {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([userId, namespace])}, 0))`);
    if (!predicate) { await transaction.delete(state).where(scope(userId, namespace)); return; }
    const rows = await transaction.select().from(state).where(scope(userId, namespace));
    const keys = rows.filter(row => {
      try { return predicate(unseal(row.payload, contextKey(userId, namespace, row.key))); }
      catch { return true; }
    }).map(row => row.key);
    if (keys.length) await transaction.delete(state).where(and(scope(userId, namespace), inArray(state.key, keys)));
  });
}
export async function rateLimitShared(userId: string, action: string, limit: number, windowMs = 60000) {
  const db = await getDatabase(), now = new Date(), expiresAt = new Date(now.getTime() + windowMs);
  // PostgreSQL locks a conflicting row and evaluates this condition again after waiting.
  // Independent functions therefore share the exact limit without read-modify-write races.
  const result = await db.db.insert(rates).values({ userId, action, count: 1, expiresAt }).onConflictDoUpdate({
    target: [rates.userId, rates.action],
    set: { count: sql`CASE WHEN ${rates.expiresAt} <= ${now} THEN 1 ELSE ${rates.count} + 1 END`,
      expiresAt: sql`CASE WHEN ${rates.expiresAt} <= ${now} THEN ${expiresAt} ELSE ${rates.expiresAt} END` },
    setWhere: sql`${rates.expiresAt} <= ${now} OR ${rates.count} < ${limit}`,
  }).returning({ count: rates.count });
  return result.length > 0;
}
