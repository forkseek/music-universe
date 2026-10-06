import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDatabase, type DatabaseContext } from "@/db/connection";
import { users } from "@/db/schema";

export const SESSION_COOKIE = "music_world_session";
export function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }

export function findUser(token: string | undefined, context = getDatabase()): string | undefined {
  if (!token || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return;
  return context.db.select({ id: users.id }).from(users).where(eq(users.sessionTokenHash, tokenHash(token))).get()?.id;
}

export function createSession(context: DatabaseContext = getDatabase()) {
  const token = randomBytes(32).toString("base64url");
  const user = context.db.insert(users).values({ sessionTokenHash: tokenHash(token) }).returning({ id: users.id }).get();
  return { userId: user.id, token };
}
