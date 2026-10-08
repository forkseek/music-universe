import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDatabase, type DatabaseContext } from "@/db/connection";
import { platformAccounts } from "@/db/schema";
import { seal, unseal } from "./vault";
import type { Platform, PlatformAccount } from "./types";
export async function readAccount(userId: string, provider: Platform, context?: DatabaseContext): Promise<PlatformAccount | null> {
    const row = (await (context || await getDatabase()).db.select().from(platformAccounts).where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.provider, provider))))[0];
    if (!row)
        return null;
    try {
        return unseal<PlatformAccount>(row.credentials, userId + ":" + provider);
    }
    catch {
        return null;
    }
}
export async function saveAccount(userId: string, provider: Platform, account: PlatformAccount, context?: DatabaseContext): Promise<void> {
    if (!context) return accountTransaction(userId, provider, db => saveAccount(userId, provider, account, db));
    await context.db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"account:" + userId + ":" + provider}, 0))`);
    const credentials = seal(account, userId + ":" + provider);
    (await context.db.insert(platformAccounts).values({ userId, provider, credentials }).onConflictDoUpdate({
        target: [platformAccounts.userId, platformAccounts.provider], set: { credentials, updatedAt: new Date() },
    }));
}
export async function deleteAccount(userId: string, provider: Platform, context?: DatabaseContext): Promise<void> {
    if (!context) return accountTransaction(userId, provider, db => deleteAccount(userId, provider, db));
    await context.db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"account:" + userId + ":" + provider}, 0))`);
    (await context.db.delete(platformAccounts).where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.provider, provider))));
}

/** Only short database work belongs here; never hold a connection across a platform request. */
export async function accountTransaction<T>(userId: string, provider: Platform, action: (db: DatabaseContext) => Promise<T>): Promise<T> {
    const context = await getDatabase();
    return context.db.transaction(async db => {
        await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"account:" + userId + ":" + provider}, 0))`);
        return action({ ...context, db });
    });
}
