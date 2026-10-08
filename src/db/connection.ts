import "server-only";
import { Pool, type PoolConfig } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import path from "node:path";
import * as schema from "./schema";
export interface DatabaseContext {
    db: PgDatabase<PgQueryResultHKT, typeof schema>;
    readonly closed: boolean;
    close(): Promise<void>;
}
/** Never include the URL in errors: it contains the database password. */
export function postgresOptions(value: string | undefined): PoolConfig {
    if (!value)
        throw new Error("请在服务端配置 Neon 的 DATABASE_URL。");
    let url: URL;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error("DATABASE_URL 必须为 PostgreSQL 连接地址。");
    }
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname.slice(1) || url.hash) {
        throw new Error("DATABASE_URL 必须为 PostgreSQL 连接地址。");
    }
    if (url.hostname.includes("-pooler."))
        throw new Error("请使用 Neon Direct connection，关闭 Connection pooling；应用已有连接池，迁移锁需要直连。");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (!local && url.searchParams.get("sslmode") === "disable")
        throw new Error("公网数据库连接必须启用 TLS。");
    // pg's URL SSL parameters override its explicit ssl option; enforce verified TLS remotely.
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
        url.searchParams.delete(key);
    return { connectionString: url.href, ssl: local ? false : { rejectUnauthorized: true },
        max: 3, idleTimeoutMillis: 20000, connectionTimeoutMillis: 15000, allowExitOnIdle: true,
        statement_timeout: 15000, application_name: "music-universe" };
}
export async function openDatabase(value = process.env.DATABASE_URL): Promise<DatabaseContext> {
    const pool = new Pool(postgresOptions(value));
    pool.on("error", () => console.warn("PostgreSQL connection interrupted; the pool will reconnect."));
    try {
        const client = await pool.connect();
        try {
            // Old/new deploys can overlap. Serialize migration checks on a dedicated connection.
            await client.query("SELECT pg_advisory_lock(85072026)");
            await migrate(drizzle(client, { schema }), {
                migrationsFolder: process.env.MUSIC_MIGRATIONS_ROOT || path.join(process.cwd(), "src/db/postgres-migrations"),
            });
        }
        finally {
            try {
                await client.query("SELECT pg_advisory_unlock(85072026)");
            }
            finally {
                client.release();
            }
        }
        let closed = false;
        return { db: drizzle(pool, { schema }), get closed() { return closed; },
            async close() { if (!closed) {
                closed = true;
                await pool.end();
            } } };
    }
    catch (error) {
        await pool.end();
        throw error;
    }
}
const shared = globalThis as typeof globalThis & {
    musicWorldPostgres?: Promise<DatabaseContext>;
};
export function getDatabase(): Promise<DatabaseContext> {
    return shared.musicWorldPostgres ??= openDatabase().catch(error => {
        shared.musicWorldPostgres = undefined;
        throw error;
    });
}
/** Preserve the original serialized import/delete behaviour with per-user PostgreSQL locks. */
export async function userTransaction<T>(context: DatabaseContext, userId: string, action: (transaction: DatabaseContext) => Promise<T>): Promise<T> {
    return context.db.transaction(async (db) => {
        await db.execute(sql `SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
        return action({ ...context, db });
    });
}
