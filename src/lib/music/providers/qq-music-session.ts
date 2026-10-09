import "server-only";
import { RequestError } from "@/lib/server/errors";
import { normalizeQqProfile, qqCookieValues, qqMusicKey, type QqUserProfile } from "./qq-profile";

/** The credentials come only from our isolated QQ Music official login window. */
export async function readQqMusicProfile(cookie: string, signal: AbortSignal): Promise<QqUserProfile> {
  const values = qqCookieValues(cookie);
  const uin = String(values.uin || values.qqmusic_uin || values.wxuin || "").replace(/^o/, "");
  if (!/^\d{5,20}$/.test(uin) || !qqMusicKey(cookie) || cookie.length > 32768 || /[\r\n]/.test(cookie)) throw new RequestError(401, "QQ 音乐授权尚未完成，请在官方窗口完成登录。", "QQ_MUSIC_LOGIN_REQUIRED");
  const url = new URL("https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg");
  url.search = new URLSearchParams({ cid: "205360838", userid: uin, reqfrom: "1", g_tk: "5381", loginUin: uin, hostUin: "0", format: "json", inCharset: "utf8", outCharset: "utf-8", notice: "0", platform: "yqq.json", needNewCode: "0" }).toString();
  try {
    const response = await fetch(url, { headers: { Cookie: cookie, Referer: "https://y.qq.com/", "User-Agent": "Mozilla/5.0" }, redirect: "error", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) });
    if (!response.ok || !response.body) throw new Error("upstream");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 256 * 1024) { await reader.cancel(); throw new Error("large"); } chunks.push(value); }
    } finally { reader.releaseLock(); }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (body.code !== 0 || !body.data?.creator) throw new RequestError(401, "QQ 音乐未确认账号资料，请重新登录。", "QQ_MUSIC_SESSION_EXPIRED");
    const creator = body.data.creator;
    const returnedId = String(creator.uin || creator.userid || creator.userId || creator.hostuin || "");
    if (returnedId && returnedId !== uin) throw new Error("identity");
    if (!(creator.nick || creator.nickname || creator.name)) throw new Error("profile");
    return normalizeQqProfile(body, { id: uin, nickname: "", avatar: "" });
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof RequestError) throw error;
    throw new RequestError(502, "暂时无法确认 QQ 音乐账号资料，请稍后重试。", "QQ_MUSIC_PROFILE_UNAVAILABLE");
  }
}
