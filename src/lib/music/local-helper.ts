import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";

interface Connection { origin: string; token: string; mediaToken: string; expiresAt: number }
interface Options {
  origins: string[];
  sessionForOrigin: (origin: string) => string | Promise<string>;
  dispatch: (request: Request) => Promise<Response>;
}
const mediaPaths = new Set(["/api/music/audio", "/api/music/album/cover", "/api/qq/audio", "/api/qq/cover", "/api/qq/avatar"]);
const apiPath = (value: string) => /^\/api\/music\/(?:session|normalize|album(?:\/cover)?|audio|(?:qq|netease|kugou|qishui)\/(?:status|search|lyrics|poll|login|cancel|logout|play))$/.test(value) || /^\/api\/qq\/(?:status|session|search|lyric|cover|avatar|audio|song\/url)$/.test(value);

/** Loopback-only transport. Platform credentials remain in the local account vault. */
export function createLocalMusicHelper(options: Options) {
  const allowed = new Set(options.origins);
  const connections = new Map<string, Connection>();
  const media = new Map<string, Connection>();
  const connectLimits = new Map<string, { until: number; count: number }>();
  function remove(connection: Connection) { connections.delete(connection.token); media.delete(connection.mediaToken); }
  const server = createServer((request, response) => { void handle(request, response).catch(() => { if (!response.headersSent) send(response, 500, "HELPER_ERROR", "本机助手暂时无法完成请求，请重试。"); else response.destroy(); }); });
  function send(response: ServerResponse, status: number, code: string, message: string) { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ error: { code, message } })); }
  async function handle(incoming: IncomingMessage, outgoing: ServerResponse) {
    outgoing.setHeader("Cache-Control", "private, no-store"); outgoing.setHeader("X-Content-Type-Options", "nosniff"); outgoing.setHeader("Referrer-Policy", "no-referrer");
    const address = server.address();
    if (!address || typeof address === "string") return send(outgoing, 503, "HELPER_STARTING", "本机助手正在启动。");
    const serviceOrigin = `http://127.0.0.1:${address.port}`;
    if (incoming.headers.host !== `127.0.0.1:${address.port}` && incoming.headers.host !== `localhost:${address.port}`) return send(outgoing, 403, "HOST_REJECTED", "无效的本机地址。");
    const origin = incoming.headers.origin || "";
    if (origin && !allowed.has(origin)) return send(outgoing, 403, "ORIGIN_REJECTED", "此网站未获准连接本机助手。");
    if (origin) {
      outgoing.setHeader("Access-Control-Allow-Origin", origin); outgoing.setHeader("Vary", "Origin");
      outgoing.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
    }
    if (incoming.method === "OPTIONS") {
      if (!origin || !["GET", "POST"].includes(String(incoming.headers["access-control-request-method"] || ""))) return send(outgoing, 403, "ORIGIN_REJECTED", "无效的本机请求。");
      const headers = String(incoming.headers["access-control-request-headers"] || "").toLowerCase().split(",").map(value => value.trim()).filter(Boolean);
      if (headers.some(value => !["authorization", "content-type", "x-music-world", "range"].includes(value))) return send(outgoing, 403, "HEADERS_REJECTED", "请求头不受支持。");
      outgoing.writeHead(204, { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Music-World, Range", "Access-Control-Allow-Private-Network": "true", "Access-Control-Max-Age": "600" }); outgoing.end(); return;
    }
    const url = new URL(incoming.url || "/", serviceOrigin);
    if (url.origin !== serviceOrigin) return send(outgoing, 400, "PATH_REJECTED", "无效的本机路径。");
    if (url.pathname === "/health" && incoming.method === "GET") {
      outgoing.writeHead(200, { "Content-Type": "application/json" }); outgoing.end(JSON.stringify({ service: "music-universe-helper", protocol: 1, ready: true })); return;
    }
    if (url.pathname === "/connect" && incoming.method === "POST") {
      if (!origin || incoming.headers["x-music-world"] !== "1") return send(outgoing, 403, "ORIGIN_REJECTED", "请从音乐宇宙网站连接助手。");
      const now = Date.now();
      for (const value of connections.values()) if (value.expiresAt <= now) remove(value);
      const limit = connectLimits.get(origin);
      if (connections.size >= 64 || (limit && limit.until > now && limit.count >= 12)) return send(outgoing, 429, "HELPER_BUSY", "连接次数较多，请稍后重试。");
      connectLimits.set(origin, !limit || limit.until <= now ? { until: now + 60000, count: 1 } : { ...limit, count: limit.count + 1 });
      const connection = { origin, token: randomBytes(32).toString("base64url"), mediaToken: randomBytes(32).toString("base64url"), expiresAt: now + 24 * 3600000 };
      await options.sessionForOrigin(origin);
      connections.set(connection.token, connection); media.set(connection.mediaToken, connection);
      outgoing.writeHead(200, { "Content-Type": "application/json" }); outgoing.end(JSON.stringify({ service: "music-universe-helper", protocol: 1, token: connection.token, mediaToken: connection.mediaToken, expiresAt: connection.expiresAt })); return;
    }
    const mediaRequest = incoming.method === "GET" && mediaPaths.has(url.pathname) && url.searchParams.has("helperMedia");
    const bearer = String(incoming.headers.authorization || "").replace(/^Bearer /, "");
    const connection = mediaRequest ? media.get(url.searchParams.get("helperMedia") || "") : connections.get(bearer);
    if (!connection || connection.expiresAt <= Date.now() || (origin && connection.origin !== origin) || (!mediaRequest && (!origin || incoming.headers["x-music-world"] !== "1"))) return send(outgoing, 401, "HELPER_CONNECTION_REQUIRED", "请重新连接本机助手。");
    if (url.pathname === "/disconnect" && incoming.method === "POST") { remove(connection); outgoing.writeHead(200, { "Content-Type": "application/json" }); outgoing.end('{"ok":true}'); return; }
    if (!apiPath(url.pathname) || !["GET", "POST"].includes(incoming.method || "")) return send(outgoing, 404, "ROUTE_NOT_FOUND", "无效的音乐请求。");
    url.searchParams.delete("helperMedia");
    const chunks: Buffer[] = []; let length = 0;
    for await (const chunk of incoming) {
      length += chunk.length;
      if (length > 4 * 1024 * 1024) return send(outgoing, 413, "BODY_TOO_LARGE", "请求内容过大。");
      chunks.push(Buffer.from(chunk));
    }
    const token = await options.sessionForOrigin(connection.origin);
    const controller = new AbortController(); outgoing.on("close", () => { if (!outgoing.writableEnded) controller.abort(); });
    const headers = new Headers({ "X-Music-World": "1", Origin: serviceOrigin, Host: `127.0.0.1:${address.port}`, Cookie: `music_world_session=${token}` });
    if (incoming.headers.range) headers.set("Range", incoming.headers.range);
    if (incoming.method === "POST") headers.set("Content-Type", "application/json");
    const request = new Request(url, { method: incoming.method, headers, signal: controller.signal, ...(incoming.method === "POST" ? { body: Buffer.concat(chunks).toString("utf8") || "{}" } : {}) });
    const result = await options.dispatch(request);
    for (const name of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]) { const value = result.headers.get(name); if (value) outgoing.setHeader(name, value); }
    outgoing.statusCode = result.status;
    if (!result.body) { outgoing.end(); return; }
    const stream = Readable.fromWeb(result.body as import("node:stream/web").ReadableStream);
    stream.on("error", () => outgoing.destroy()); outgoing.on("close", () => stream.destroy()); stream.pipe(outgoing);
  }
  server.on("close", () => { connections.clear(); media.clear(); connectLimits.clear(); });
  server.requestTimeout = 65000; server.headersTimeout = 10000;
  return server;
}
