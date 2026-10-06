import { afterEach, describe, expect, it, vi } from "vitest";
import { radiohandSearchPage } from "@/lib/music/providers/radiohand-qq";

const signal = () => new AbortController().signal;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("QQ full song search and suggestion fallback", () => {
  it("requests pages of full results and normalizes song, singer, album, duration and rights metadata", async () => {
    vi.stubEnv("RADIOHAND_API_ORIGIN", "");
    const upstream = vi.fn(async (_: unknown, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      expect(body.req.param).toMatchObject({ query: "晴天", page_num: 2, num_per_page: 12, sin: 12 });
      return Response.json({ code: 0, req: { code: 0, data: { body: { item_song: [{ name: "晴天", mid: "song123", singer: [{ name: "周杰伦" }], interval: 269, album: { mid: "album123", name: "叶惠美" }, file: { media_mid: "media123" }, pay: { pay_play: 1 } }] } } } });
    });
    vi.stubGlobal("fetch", upstream);
    const result = await radiohandSearchPage(" 晴天 ", 12, signal(), undefined, 2);
    expect(result).toMatchObject({ query: "晴天", page: 2, hasMore: false, source: "search", songs: [{ name: "晴天", artist: "周杰伦", album: "叶惠美", duration: 269000, fee: 1, mid: "song123", mediaMid: "media123", cover: "/api/qq/cover?mid=album123" }] });
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("accepts a genuine empty search without substituting suggestions or old results", async () => {
    vi.stubEnv("RADIOHAND_API_ORIGIN", "");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: 0, req: { code: 0, data: { body: { item_song: [] } } } })));
    expect(await radiohandSearchPage("没有结果的词", 12, signal())).toMatchObject({ songs: [], hasMore: false, source: "search" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("falls back to public suggestions only when full search is unavailable", async () => {
    vi.stubEnv("RADIOHAND_API_ORIGIN", "");
    vi.stubGlobal("fetch", vi.fn(async input => {
      const url = String(input);
      if (url.includes("smartbox_new")) return Response.json({ data: { song: { itemlist: [{ name: "晴天", mid: "song123", singer: "周杰伦" }] } } });
      return Response.json({ code: 2000 });
    }));
    expect(await radiohandSearchPage("晴天", 12, signal())).toMatchObject({ source: "suggestions", hasMore: false, songs: [{ name: "晴天", artist: "周杰伦" }] });
  });
  it("rejects invalid input before sending requests and respects the thirty-song page limit", async () => {
    vi.stubEnv("RADIOHAND_API_ORIGIN", "");
    const request = vi.fn(async (_: unknown, options?: RequestInit) => {
      expect(JSON.parse(String(options?.body)).req.param.num_per_page).toBe(30);
      return Response.json({ code: 0, req: { code: 0, data: { body: { item_song: [] } } } });
    });
    vi.stubGlobal("fetch", request);
    for (const query of ["", "   ", "x".repeat(81)]) await expect(radiohandSearchPage(query, 12, signal())).rejects.toMatchObject({ status: 400 });
    expect(request).not.toHaveBeenCalled();
    await radiohandSearchPage("周杰伦", 999, signal());
  });
});
