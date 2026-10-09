import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createLocalMusicHelper } from "../src/lib/music/local-helper";

const root = process.cwd();
const port = Number(process.env.MUSIC_HELPER_PORT || 43891);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid MUSIC_HELPER_PORT");
const directory = path.resolve(process.env.MUSIC_HELPER_DATA || path.join(root, "data/music-helper"));
mkdirSync(directory, { recursive: true });
process.env.DATABASE_PATH = path.join(directory, "accounts.db");
process.env.APP_ORIGIN = `http://127.0.0.1:${port}`;
process.env.MUSIC_INTEGRATION_ROOT = path.join(root, "integrations/mineradio");
process.env.MUSIC_DESKTOP_LOGIN = "1";
delete process.env.NETLIFY;

const defaultOrigins = ["https://music-universe-forkseek.netlify.app", "http://127.0.0.1:3000", "http://127.0.0.1:3002", "http://127.0.0.1:3018", "http://127.0.0.1:5188", "http://localhost:3000"];
const origins = [...new Set([...defaultOrigins, ...(process.env.MUSIC_HELPER_ALLOWED_ORIGINS || "").split(/\s+/).filter(Boolean)])];
for (const value of origins) {
  const url = new URL(value);
  if (value !== url.origin || url.username || url.password || !(url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) throw new Error("MUSIC_HELPER_ALLOWED_ORIGINS must contain exact HTTPS or loopback origins");
}
const { NextRequest } = await import("next/server");
const { createSession, findUser } = await import("../src/lib/server/session");
const { cancelLogin } = await import("../src/lib/music/platforms/login");
const platform = await import("../src/app/api/music/[provider]/[action]/route");
type Route = { GET?: (request: InstanceType<typeof NextRequest>) => Promise<Response> | Response; POST?: (request: InstanceType<typeof NextRequest>) => Promise<Response> | Response };
const routes: Record<string, Route> = {
  "/api/music/session": await import("../src/app/api/music/session/route"),
  "/api/music/album": await import("../src/app/api/music/album/route"),
  "/api/music/album/cover": await import("../src/app/api/music/album/cover/route"),
  "/api/music/audio": await import("../src/app/api/music/audio/route"),
  "/api/music/normalize": await import("../src/app/api/music/normalize/route"),
  "/api/qq/status": await import("../src/app/api/qq/status/route"),
  "/api/qq/session": await import("../src/app/api/qq/session/route"),
  "/api/qq/search": await import("../src/app/api/qq/search/route"),
  "/api/qq/lyric": await import("../src/app/api/qq/lyric/route"),
  "/api/qq/cover": await import("../src/app/api/qq/cover/route"),
  "/api/qq/avatar": await import("../src/app/api/qq/avatar/route"),
  "/api/qq/audio": await import("../src/app/api/qq/audio/route"),
  "/api/qq/song/url": await import("../src/app/api/qq/song/url/route"),
};
const sessionsFile = path.join(directory, "site-sessions.json");
let sessions: Record<string, string> = {};
try {
  const saved: unknown = JSON.parse(readFileSync(sessionsFile, "utf8"));
  if (saved && typeof saved === "object" && !Array.isArray(saved)) sessions = Object.fromEntries(Object.entries(saved).filter(([origin, token]) => origins.includes(origin) && typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)));
} catch { /* First run. */ }
const server = createLocalMusicHelper({
  origins,
  sessionForOrigin(origin) {
    if (!findUser(sessions[origin])) {
      sessions[origin] = createSession().token;
      writeFileSync(sessionsFile, JSON.stringify(sessions), { mode: 0o600 });
    }
    return sessions[origin];
  },
  async dispatch(request) {
    const next = new NextRequest(request);
    const match = /^\/api\/music\/(qq|netease|kugou|qishui)\/([a-z]+)$/.exec(next.nextUrl.pathname);
    const method = request.method as "GET" | "POST";
    if (match) return platform[method](next, { params: Promise.resolve({ provider: match[1], action: match[2] }) });
    const handler = routes[next.nextUrl.pathname]?.[method];
    return handler ? handler(next) : Response.json({ error: { code: "NOT_FOUND", message: "无效的音乐请求。" } }, { status: 404 });
  },
});
function stop() {
  for (const token of Object.values(sessions)) { const user = findUser(token); if (user) for (const provider of ["qq", "netease", "kugou", "qishui"] as const) cancelLogin(user, provider); }
  const runtime = globalThis as typeof globalThis & { musicPlatformWorker?: { child: { kill(): boolean } } };
  runtime.musicPlatformWorker?.child.kill();
  server.close(); server.closeAllConnections();
}
process.once("SIGINT", stop); process.once("SIGTERM", stop);
server.on("error", error => { console.error(error.message.includes("EADDRINUSE") ? "本机助手端口已被占用，请使用已运行的助手。" : "本机助手无法启动。"); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log(`音乐宇宙本机助手已启动：http://127.0.0.1:${port}\n在网站的音乐搜索中点击“连接本机助手”，再选择平台登录。`));
