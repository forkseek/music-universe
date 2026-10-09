import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { request as httpRequest, type Server } from "node:http";
import { createLocalMusicHelper } from "@/lib/music/local-helper";

const site = "https://music-universe-forkseek.netlify.app";
const other = "https://preview.example";
let server: Server, base: string;
const dispatch = vi.fn(async (request: Request) => Response.json({ path: new URL(request.url).pathname, method: request.method }, { headers: { "Set-Cookie": "private-platform-cookie=fixture", "Access-Control-Allow-Origin": "*" } }));
const sessions = vi.fn((origin: string) => origin === site ? "fixture-site-session" : "fixture-other-session");
beforeEach(async () => {
  dispatch.mockClear(); sessions.mockClear();
  server = createLocalMusicHelper({ origins: [site, other], sessionForOrigin: sessions, dispatch });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
const call = (path: string, init?: RequestInit) => fetch(base + path, init);
async function connect(origin = site) {
  const response = await call("/connect", { method: "POST", headers: { Origin: origin, "X-Music-World": "1" } });
  expect(response.status).toBe(200);
  return response.json() as Promise<{ token: string; mediaToken: string }>;
}
const headers = (token: string, origin = site) => ({ Origin: origin, "X-Music-World": "1", Authorization: `Bearer ${token}` });

describe("local music helper transport", () => {
  it("binds tokens to an exact origin and supplies only the private local session internally", async () => {
    const connection = await connect();
    expect(connection.token).toHaveLength(43); expect(connection.mediaToken).not.toBe(connection.token);
    const response = await call("/api/music/qq/status", { headers: { ...headers(connection.token), Cookie: "foreign-cookie=fixture" } });
    expect(response.status).toBe(200); expect(response.headers.get("access-control-allow-origin")).toBe(site);
    expect(response.headers.has("set-cookie")).toBe(false); expect(response.headers.has("access-control-allow-credentials")).toBe(false);
    const internal = dispatch.mock.calls[0][0];
    expect(internal.headers.get("cookie")).toBe("music_world_session=fixture-site-session");
    expect(internal.headers.get("origin")).toBe(base); expect(internal.headers.has("authorization")).toBe(false);
    expect(await response.text()).not.toContain("fixture-site-session");
    expect((await call("/api/music/qq/status", { headers: headers(connection.token, other) })).status).toBe(401);
    expect((await call("/api/music/qq/status")).status).toBe(401);
    expect((await call("/api/music/qq/status", { headers: { Origin: site, Authorization: `Bearer ${connection.token}` } })).status).toBe(401);
  });
  it("rejects foreign origins, simple form posts, private route access and DNS rebinding", async () => {
    expect((await call("/connect", { method: "POST", headers: { Origin: "https://attacker.example", "X-Music-World": "1" } })).status).toBe(403);
    expect((await call("/connect", { method: "POST", headers: { Origin: site } })).status).toBe(403);
    expect((await call("/connect", { method: "POST" })).status).toBe(403);
    const { token } = await connect();
    expect((await call("/api/admin", { headers: headers(token) })).status).toBe(404);
    const rebinding = await new Promise<number | undefined>((resolve, reject) => {
      httpRequest(base + "/health", { headers: { Host: "attacker.example" } }, response => { response.resume(); resolve(response.statusCode); }).on("error", reject).end();
    });
    expect(rebinding).toBe(403); expect(dispatch).not.toHaveBeenCalled();
  });
  it("supports browser preflight with an exact origin and limited headers", async () => {
    const response = await call("/connect", { method: "OPTIONS", headers: { Origin: site, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,x-music-world,content-type", "Access-Control-Request-Private-Network": "true" } });
    expect(response.status).toBe(204); expect(response.headers.get("access-control-allow-private-network")).toBe("true");
    expect(response.headers.get("access-control-allow-origin")).toBe(site);
    expect((await call("/connect", { method: "OPTIONS", headers: { Origin: site, "Access-Control-Request-Method": "DELETE" } })).status).toBe(403);
  });
  it("limits query tokens to read-only media and invalidates both tokens on disconnect", async () => {
    const { token, mediaToken } = await connect();
    expect((await call(`/api/music/audio?ticket=fixture&helperMedia=${mediaToken}`, { headers: { Range: "bytes=0-10" } })).status).toBe(200);
    const request = dispatch.mock.calls[0][0];
    expect(request.headers.get("range")).toBe("bytes=0-10"); expect(request.url).not.toContain(mediaToken);
    expect((await call(`/api/music/qq/status?helperMedia=${mediaToken}`)).status).toBe(401);
    expect((await call(`/api/music/qq/login?helperMedia=${mediaToken}`, { method: "POST" })).status).toBe(401);
    expect((await call(`/api/music/audio?helperMedia=${mediaToken}`, { headers: { Origin: other } })).status).toBe(401);
    expect((await call("/disconnect", { method: "POST", headers: headers(token) })).status).toBe(200);
    expect((await call("/api/music/qq/status", { headers: headers(token) })).status).toBe(401);
    expect((await call(`/api/music/audio?helperMedia=${mediaToken}`)).status).toBe(401);
  });
  it("does not expose private handler failures and rejects oversized writes", async () => {
    const { token } = await connect();
    dispatch.mockRejectedValueOnce(new Error("fixture-private-cookie"));
    const failed = await call("/api/music/qq/status", { headers: headers(token) });
    expect(failed.status).toBe(500); expect(await failed.text()).not.toContain("fixture-private-cookie");
    const large = await call("/api/music/qq/login", { method: "POST", headers: headers(token), body: "x".repeat(4 * 1024 * 1024 + 1) });
    expect(large.status).toBe(413);
  });
});
