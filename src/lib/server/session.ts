import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDatabase, type DatabaseContext } from "@/db/connection";
import { users } from "@/db/schema";
export const SESSION_COOKIE = "music_world_session";
export function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
export async function findUser(token: string | undefined, context: DatabaseContext | Promise<DatabaseContext> = getDatabase()): Promise<string | undefined> {
    context = await context;
    if (!token || !/^[A-Za-z0-9_-]{43}$/u.test(token))
        return;
    return (await context.db.select({ id: users.id }).from(users).where(eq(users.sessionTokenHash, tokenHash(token))))[0]?.id;
}
export async function createSession(context: DatabaseContext | Promise<DatabaseContext> = getDatabase()) {
    context = await context;
    const token = randomBytes(32).toString("base64url");
    const user = (await context.db.insert(users).values({ sessionTokenHash: tokenHash(token) }).returning({ id: users.id }))[0];
    return { userId: user.id, token };
}
