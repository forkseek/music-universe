import type { NextRequest } from "next/server";
import { SESSION_COOKIE, findUser } from "@/lib/server/session";
import { qqOAuthAvatar } from "@/lib/music/providers/qq-oauth";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const owner = findUser(request.cookies.get(SESSION_COOKIE)?.value), source = owner && qqOAuthAvatar(owner);
    if (!source) return new Response(null, { status: 404 });
    const url = new URL(source);
    if (url.protocol !== "https:" || url.port || url.username || url.password || !["qq.com", "qlogo.cn", "gtimg.cn", "qpic.cn"].some(host => url.hostname === host || url.hostname.endsWith("." + host))) throw new Error("source");
    const result = await fetch(url, { redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(6000)]), cache: "no-store" });
    const type = result.headers.get("content-type")?.split(";")[0];
    if (!result.ok || !["image/png", "image/jpeg", "image/webp"].includes(type || "")) throw new Error("type");
    const reader = result.body?.getReader(); if (!reader) throw new Error("empty");
    let size = 0; const chunks: Uint8Array[] = [];
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 512 * 1024) { await reader.cancel(); throw new Error("size"); } chunks.push(value); } } finally { reader.releaseLock(); }
    return new Response(Buffer.concat(chunks), { headers: { "Content-Type": type!, "Cache-Control": "private, max-age=60", Vary: "Cookie", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } }); }
}
