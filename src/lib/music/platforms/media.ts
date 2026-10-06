import "server-only";
import { randomBytes } from "node:crypto";
import { RequestError } from "@/lib/server/errors";
import { platformCall } from "./runtime";
import type { Platform } from "./types";

const domains: Record<Platform, string[]> = {
  qq: ["stream.qqmusic.qq.com"], netease: ["music.126.net", "music.163.com"],
  kugou: ["kugou.com", "kugou.net", "kugoucdn.com"],
  qishui: ["douyinvod.com", "bytecdn.cn", "bytecdn.com", "qishui.com", "music.126.net"],
};
const referers: Record<Platform, string> = { qq: "https://y.qq.com/", netease: "https://music.163.com/", kugou: "https://www.kugou.com/", qishui: "https://www.qishui.com/" };
export function trustedMediaUrl(provider: Platform, value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    if (!domains[provider].some(host => url.hostname === host || url.hostname.endsWith("." + host))) return null;
    // Upgrade catalogues that still publish legacy HTTP CDN links.
    url.protocol = "https:";
    return url;
  } catch { return null; }
}
interface Ticket { userId: string; provider: Platform; url: string; expires: number; decoded?: Promise<{ buffer: Buffer; contentType: string }> }
const runtime = globalThis as typeof globalThis & { musicMediaTickets?: Map<string, Ticket> };
const tickets = () => runtime.musicMediaTickets ??= new Map();
export function revokeMedia(userId: string, provider: Platform) { for (const [id, t] of tickets()) if (t.userId === userId && t.provider === provider) tickets().delete(id); }
export function musicMediaTicket(userId: string, provider: Platform, url: string) {
  const approved = trustedMediaUrl(provider, url);
  if (!approved) throw new RequestError(502, "平台返回的音源地址暂不受支持。", "AUDIO_HOST_REJECTED");
  for (const [id, t] of tickets()) if (t.expires <= Date.now()) tickets().delete(id);
  while (tickets().size >= 160) tickets().delete(tickets().keys().next().value!);
  const id = randomBytes(24).toString("base64url");
  tickets().set(id, { userId, provider, url: approved.href, expires: Date.now() + 15 * 60 * 1000 });
  return "/api/music/audio?ticket=" + id;
}
export function parseAudioRange(range: string | null, size: number) {
  if (!range) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start < size && end >= start ? { start, end, partial: true } : null;
}
const maxAudioBytes = 48 * 1024 * 1024;
async function upstream(ticket: Ticket, range: string | null, signal: AbortSignal) {
  let url = trustedMediaUrl(ticket.provider, ticket.url)!;
  url.hash = "";
  for (let i = 0; i < 4; i++) {
    const response = await fetch(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]), headers: { Referer: referers[ticket.provider], "User-Agent": "Mozilla/5.0", ...(range ? { Range: range } : {}) } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get("location");
      await response.body?.cancel();
      const approved = next && trustedMediaUrl(ticket.provider, new URL(next, url).href);
      if (!approved) throw new RequestError(502, "音源跳转无效。", "AUDIO_REDIRECT_REJECTED");
      url = approved; continue;
    }
    if (![200, 206].includes(response.status) || !response.body) { await response.body?.cancel(); throw new RequestError(502, "音源已失效，请重新点击播放。", "AUDIO_UNAVAILABLE"); }
    const type = response.headers.get("content-type") || "application/octet-stream";
    if (!/^(audio\/|video\/mp4|application\/octet-stream)/i.test(type) || Number(response.headers.get("content-length")) > maxAudioBytes) {
      await response.body.cancel(); throw new RequestError(502, "平台返回了无效或过大的音频。", "AUDIO_INVALID");
    }
    return response;
  }
  throw new RequestError(502, "音源跳转过多。", "AUDIO_REDIRECT_LIMIT");
}
export async function musicAudio(userId: string, id: string, range: string | null, signal: AbortSignal) {
  const ticket = tickets().get(id);
  if (!ticket || ticket.userId !== userId || ticket.expires <= Date.now()) throw new RequestError(404, "播放已过期，请重新点击歌曲。", "AUDIO_NOT_FOUND");
  if (range && !/^bytes=(\d*)-(\d*)$/.test(range)) return new Response(null, { status: 416 });
  const headers = new Headers({ "Cache-Control": "private, no-store", "Vary": "Cookie", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff" });
  const auth = new URL(ticket.url).hash;
  if (ticket.provider === "qishui" && auth.startsWith("#auth=")) {
    // Only decode the platform's authorized stream with its returned format key.
    if (!ticket.decoded) ticket.decoded = (async () => {
      const response = await upstream(ticket, null, signal);
      const chunks: Uint8Array[] = []; let length = 0;
      const reader = response.body!.getReader();
      try { while (true) { const value = await reader.read(); if (value.done) break; length += value.value.length; if (length > maxAudioBytes) { await reader.cancel(); throw new Error("size"); } chunks.push(value.value); } }
      finally { reader.releaseLock(); }
      const result = await platformCall("qishui", "decode", { buffer: Buffer.concat(chunks), auth: decodeURIComponent(auth.slice(6)) }, "", signal);
      return { buffer: Buffer.from(result.buffer as Uint8Array), contentType: String(result.contentType) };
    })().catch(error => { ticket.decoded = undefined; throw error; });
    const decoded = await ticket.decoded;
    const selected = parseAudioRange(range, decoded.buffer.length);
    if (!selected) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + decoded.buffer.length } });
    headers.set("Content-Type", decoded.contentType);
    headers.set("Content-Length", String(selected.end - selected.start + 1));
    if (selected.partial) headers.set("Content-Range", `bytes ${selected.start}-${selected.end}/${decoded.buffer.length}`);
    // Release decoded buffers after this request; do not retain entire libraries in RAM.
    ticket.decoded = undefined;
    return new Response(new Uint8Array(decoded.buffer.subarray(selected.start, selected.end + 1)), { status: selected.partial ? 206 : 200, headers });
  }
  const response = await upstream(ticket, range, signal);
  for (const name of ["Content-Type", "Content-Length", "Content-Range"]) { const v = response.headers.get(name); if (v) headers.set(name, v); }
  let size = 0;
  const limited = response.body!.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) { size += chunk.length; if (size > maxAudioBytes) { controller.error(new Error("Audio size limit")); return; } controller.enqueue(chunk); } }));
  return new Response(limited, { status: response.status, headers });
}
