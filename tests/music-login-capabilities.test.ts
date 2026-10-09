import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desktopAvailable } from "@/lib/music/platforms/runtime";

const fixtures = vi.hoisted(() => ({ exists: vi.fn() }));
vi.mock("node:fs", () => ({ existsSync: fixtures.exists }));
const request = (host: string, url = "http://localhost:3000/api/music/kugou/status") => new Request(url, { headers: { host } });
beforeEach(() => {
  fixtures.exists.mockReturnValue(true);
  vi.stubEnv("APP_ORIGIN", ""); vi.stubEnv("MUSIC_DESKTOP_LOGIN", "1"); vi.stubEnv("NETLIFY", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("desktop music login is available only to local visitors", () => {
  it("accepts loopback visitors, including IPv6, when the component is installed", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) expect(desktopAvailable(request(host))).toBe(true);
  });
  it("does not advertise a server's installed component to a public visitor", () => {
    expect(desktopAvailable(request("music-universe-forkseek.netlify.app"))).toBe(false);
    expect(desktopAvailable(new Request("https://music.example/api/music/kugou/status"))).toBe(false);
    expect(desktopAvailable(request("localhost.attacker.example"))).toBe(false);
  });
  it("honors a public APP_ORIGIN even behind a proxy with a loopback Host", () => {
    vi.stubEnv("APP_ORIGIN", "https://music.example");
    expect(desktopAvailable(request("localhost:3000"))).toBe(false);
    expect(desktopAvailable()).toBe(false);
  });
  it("rejects disabled, missing and Netlify components", () => {
    vi.stubEnv("MUSIC_DESKTOP_LOGIN", "0"); expect(desktopAvailable(request("localhost:3000"))).toBe(false);
    vi.stubEnv("MUSIC_DESKTOP_LOGIN", "1"); fixtures.exists.mockReturnValue(false); expect(desktopAvailable(request("localhost:3000"))).toBe(false);
    fixtures.exists.mockReturnValue(true); vi.stubEnv("NETLIFY", "true"); expect(desktopAvailable(request("localhost:3000"))).toBe(false);
  });
  it("fails closed for malformed or credential-bearing origins", () => {
    vi.stubEnv("APP_ORIGIN", "invalid"); expect(desktopAvailable(request("localhost:3000"))).toBe(false);
    vi.stubEnv("APP_ORIGIN", "https://user:password@localhost"); expect(desktopAvailable(request("localhost:3000"))).toBe(false);
    vi.stubEnv("APP_ORIGIN", ""); expect(desktopAvailable(request("invalid host"))).toBe(false);
  });
});
