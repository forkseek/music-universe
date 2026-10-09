import { afterEach, describe, expect, it, vi } from "vitest";
import { readQqMusicProfile } from "@/lib/music/providers/qq-music-session";
const cookie = "uin=o12345678; qm_keyst=fixture-local-music-session";
const signal = () => new AbortController().signal;
afterEach(() => vi.unstubAllGlobals());
describe("QQ Music local official-window profile (upstream fixtures)", () => {
  it("requests the official profile using the isolated session and returns only public display data", async () => {
    const fetcher = vi.fn(async () => Response.json({ code: 0, data: { creator: { uin: "12345678", nick: "测试听众", headpic: "https://y.qq.com/fixture.jpg" } } }));
    vi.stubGlobal("fetch", fetcher);
    const profile = await readQqMusicProfile(cookie, signal());
    expect(profile).toEqual({ id: "12345678", nickname: "测试听众", avatar: "https://y.qq.com/fixture.jpg" });
    expect(JSON.stringify(profile)).not.toContain("fixture-local-music-session");
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(new URL(String(url)).hostname).toBe("c.y.qq.com");
    expect(new Headers(options?.headers).get("cookie")).toBe(cookie); expect(options?.redirect).toBe("error");
  });
  it("rejects generic QQ credentials, other identities and upstream failures without exposing secrets", async () => {
    const fetcher = vi.fn(async () => Response.json({ code: 0, data: { creator: { uin: "99999999", nick: "Other" } } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(readQqMusicProfile("uin=o12345678; skey=fixture-generic", signal())).rejects.toMatchObject({ code: "QQ_MUSIC_LOGIN_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(readQqMusicProfile(cookie, signal())).rejects.toMatchObject({ code: "QQ_MUSIC_PROFILE_UNAVAILABLE" });
    fetcher.mockResolvedValueOnce(Response.json({ code: -1 }));
    await expect(readQqMusicProfile(cookie, signal())).rejects.toMatchObject({ code: "QQ_MUSIC_SESSION_EXPIRED" });
    fetcher.mockRejectedValueOnce(new Error(cookie));
    await expect(readQqMusicProfile(cookie, signal())).rejects.toThrow("暂时无法确认 QQ 音乐账号资料");
  });
});
