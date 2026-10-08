import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { RequestError } from "@/lib/server/errors";

let cached: { secret: string; key: Buffer } | undefined;
function vaultKey() {
  const secret = process.env.MUSIC_CREDENTIAL_SECRET;
  if (!secret || secret.length < 32)
    throw new RequestError(503, "服务端尚未配置固定的账号加密密钥。", "MUSIC_VAULT_UNCONFIGURED");
  if (cached?.secret !== secret) cached = { secret, key: scryptSync(secret, "music-world-platform-vault", 32) };
  return cached.key;
}

/** The context binds encrypted state to its owner and purpose. Never log ciphertext inputs. */
export function seal(value: unknown, context: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(v => v.toString("base64url")).join(".");
}

export function unseal<T>(value: string, context: string): T {
  const [iv, tag, data] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")) as T;
}
