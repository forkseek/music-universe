import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, createSession, findUser } from "./session";
import { RequestError } from "./errors";

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const host = request.headers.get("host");
  // Standalone Next may expose localhost in request.url even when the browser used 127.0.0.1.
  // A configured public origin remains authoritative behind a reverse proxy.
  let allowed: string;
  try { allowed = process.env.APP_ORIGIN || (host ? new URL(`${url.protocol}//${host}`).origin : url.origin); }
  catch { throw new RequestError(403, "请求来源无效，请从当前网站重新操作。", "ORIGIN_REJECTED"); }
  if (request.headers.get("x-music-world") !== "1" || (origin && origin !== allowed) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new RequestError(403, "请求来源无效，请从当前网站重新操作。", "ORIGIN_REJECTED");
  }
}

export async function withUser(request: NextRequest, action: (userId: string) => unknown | Promise<unknown>, create = false) {
  try {
    if (request.method !== "GET") requireSameOrigin(request);
    let userId = findUser(request.cookies.get(SESSION_COOKIE)?.value);
    let session: ReturnType<typeof createSession> | undefined;
    if (!userId && create) { session = createSession(); userId = session.userId; }
    if (!userId) throw new RequestError(404, "未找到当前会话的数据。", "NOT_FOUND");
    const value = await action(userId);
    const response = NextResponse.json(value, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
    if (session) response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
      secure: (process.env.APP_ORIGIN ?? request.url).startsWith("https://"),
    });
    return response;
  } catch (error) {
    const known = error instanceof RequestError;
    if (!known) console.error("Music World request failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: { code: known ? error.code : "INTERNAL_ERROR", message: known ? error.message : "暂时无法完成操作，请稍后重试。" } }, { status: known ? error.status : 500, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  }
}

export async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const claimed = Number(request.headers.get("content-length"));
  if (claimed > maxBytes) throw new RequestError(413, "请求过大，请拆分文件。", "BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) { await reader.cancel(); throw new RequestError(413, "请求过大，请拆分文件。", "BODY_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return body;
}

export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const bytes = await readBoundedBody(request, maxBytes);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new RequestError(400, "请求需要合法 JSON。", "INVALID_JSON"); }
}
