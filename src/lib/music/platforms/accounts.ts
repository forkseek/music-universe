import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { platformAccounts } from "@/db/schema";
import { RequestError } from "@/lib/server/errors";
import type { Platform, PlatformAccount } from "./types";

let key: Buffer | undefined;
function vaultKey() {
  if (key) return key;
  if (process.env.MUSIC_CREDENTIAL_SECRET) return key = scryptSync(process.env.MUSIC_CREDENTIAL_SECRET, "music-world-platform-vault", 32);
  const file = path.join(path.dirname(path.resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH || "./data/music-world.db")), ".music-vault-key");
  mkdirSync(path.dirname(file), { recursive: true });
  try { key = readFileSync(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const generated = randomBytes(32);
    try { writeFileSync(file, generated, { flag: "wx", mode: 0o600 }); key = generated; }
    catch (failure) { if ((failure as NodeJS.ErrnoException).code !== "EEXIST") throw failure; key = readFileSync(file); }
  }
  if (key.length !== 32) throw new RequestError(500, "音乐账号存储暂不可用。", "MUSIC_VAULT_INVALID");
  return key;
}
export function readAccount(userId: string, provider: Platform): PlatformAccount | null {
  const row = getDatabase().db.select().from(platformAccounts).where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.provider, provider))).get();
  if (!row) return null;
  try {
    const [iv, tag, data] = row.credentials.split(".");
    const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(userId + ":" + provider)); decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")) as PlatformAccount;
  } catch { return null; }
}
export function saveAccount(userId: string, provider: Platform, account: PlatformAccount) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  cipher.setAAD(Buffer.from(userId + ":" + provider));
  const data = Buffer.concat([cipher.update(JSON.stringify(account)), cipher.final()]);
  const credentials = [iv, cipher.getAuthTag(), data].map(v => v.toString("base64url")).join(".");
  getDatabase().db.insert(platformAccounts).values({ userId, provider, credentials }).onConflictDoUpdate({
    target: [platformAccounts.userId, platformAccounts.provider], set: { credentials, updatedAt: new Date() },
  }).run();
}
export function deleteAccount(userId: string, provider: Platform) {
  getDatabase().db.delete(platformAccounts).where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.provider, provider))).run();
}
