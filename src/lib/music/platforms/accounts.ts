import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { platformAccounts } from "@/db/schema";
import { RequestError } from "@/lib/server/errors";
import type { Platform, PlatformAccount } from "./types";
let key: Buffer | undefined;
function vaultKey() {
    if (key)
        return key;
    const secret = process.env.MUSIC_CREDENTIAL_SECRET;
    if (!secret || secret.length < 32)
        throw new RequestError(503, "服务端尚未配置固定的账号加密密钥。", "MUSIC_VAULT_UNCONFIGURED");
    return key = scryptSync(secret, "music-world-platform-vault", 32);
}
export async function readAccount(userId: string, provider: Platform): Promise<PlatformAccount | null> {
    const row = (await (await getDatabase()).db.select().from(platformAccounts).where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.provider, provider))))[0];
    if (!row)
        return null;
    try {
        const [iv, tag, data] = row.credentials.split(".");
        const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(iv, "base64url"));
        decipher.setAAD(Buffer.from(userId + ":" + provider));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));
        return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")) as PlatformAccount;
    }
    catch {
        return null;
    }
}
export async function saveAccount(userId: string, provider: Platform, account: PlatformAccount) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
    cipher.setAAD(Buffer.from(userId + ":" + provider));
    const data = Buffer.concat([cipher.update(JSON.stringify(account)), cipher.final()]);
    const credentials = [iv, cipher.getAuthTag(), data].map(v => v.toString("base64url")).join(".");
    (await (await getDatabase()).db.insert(platformAccounts).values({ userId, provider, credentials }).onConflictDoUpdate({
        target: [platformAccounts.userId, platformAccounts.provider], set: { credentials, updatedAt: new Date() },
    }));
}
export async function deleteAccount(userId: string, provider: Platform) {
    (await (await getDatabase()).db.delete(platformAccounts).where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.provider, provider))));
}
