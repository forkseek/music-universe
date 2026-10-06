import { describe, expect, it, vi } from "vitest";
import { checkQQMusicSDKAvailability, createQQMusicBrowserProvider, type QQMusicSDK } from "@/lib/music/providers/qqmusic";

function song(index: number) {
  return { SongId: index, SongMid: `mid${index}`, SongName: `Track ${index}`, SingerName: "Singer",
    AlbumName: "Album", SongPlayTime: 201, SongPlayUrl: "https://private.invalid/audio.mp3" };
}

describe("QQ Music official H5 adapter, tested with an SDK stand-in", () => {
  it("requires a feature flag, complete SDK methods and real auth status", async () => {
    const sdk: QQMusicSDK = { getAuthStatus: vi.fn(async () => false), goAuthPage: vi.fn(), describeSelfSongList: vi.fn(async () => []),
      describeSongList: vi.fn(async () => ({})), describeRecentPlay: vi.fn(async () => ({})) };
    expect(await checkQQMusicSDKAvailability(sdk, false)).toMatchObject({ reason: "FEATURE_DISABLED" });
    expect(await checkQQMusicSDKAvailability(undefined, true)).toMatchObject({ reason: "OFFICIAL_SDK_NOT_AVAILABLE" });
    expect(await checkQQMusicSDKAvailability({ getAuthStatus: sdk.getAuthStatus }, true)).toMatchObject({ reason: "OFFICIAL_INTEGRATION_PENDING" });
    expect(await checkQQMusicSDKAvailability(sdk, true)).toMatchObject({ reason: "OFFICIAL_AUTH_REQUIRED" });
    expect(await checkQQMusicSDKAvailability({ ...sdk, getAuthStatus: async () => { throw Error("SDK failed"); } }, true))
      .toMatchObject({ reason: "OFFICIAL_AUTH_CHECK_FAILED" });
  });

  it("paginates from page zero in batches of 30 and keeps only metadata", async () => {
    const all = Array.from({ length: 65 }, (_, index) => song(index + 1));
    const describeSongList = vi.fn(async ({ DissId, Page, PageSize }: { DissId: number; Page: number; PageSize: number }) => ({
      DissId, TotalNum: all.length, SongList: all.slice(Page * PageSize, (Page + 1) * PageSize),
    }));
    const sdk: QQMusicSDK = { getAuthStatus: async () => true, goAuthPage: vi.fn(),
      describeSelfSongList: async () => [{ DissId: 123, DissName: "我的歌单", SongNum: 65 }], describeSongList,
      describeRecentPlay: async () => ({ Data: { Song: [{ Id: 64, Title: "Track 64", Singer: ["Singer"], AlbumTitle: "Album",
        SongPlayUrl: "https://private.invalid/audio.mp3" }] } }) };
    const provider = createQQMusicBrowserProvider(sdk, true);
    expect(await provider.getAvailability()).toEqual({ available: true });
    expect((await provider.listPlaylists!())[0]).toMatchObject({ externalId: "123", trackCount: 65 });
    const tracks = await provider.getPlaylistTracks!("123");
    expect(tracks).toHaveLength(65);
    expect(describeSongList.mock.calls.map((call) => call[0])).toEqual([
      { DissId: 123, Page: 0, PageSize: 30 }, { DissId: 123, Page: 1, PageSize: 30 }, { DissId: 123, Page: 2, PageSize: 30 },
    ]);
    expect(tracks[0].source).toMatchObject({ provider: "qqmusic", importedVia: "official", externalId: "1",
      playlistExternalId: "123", playlistName: "我的歌单", row: 1 });
    expect(tracks[0].durationMs).toBe(201000);
    expect(JSON.stringify(tracks)).not.toContain("SongPlayUrl");
    expect(JSON.stringify(tracks)).not.toContain("audio.mp3");
    const recent = await provider.getRecentTracks!();
    expect(recent).toHaveLength(1);
    expect(recent[0].rawMetadata.recentlyPlayed).toBe(true);
    expect(JSON.stringify(recent)).not.toContain("audio.mp3");
  });

  it("stops on repeated or empty pages instead of looping forever", async () => {
    const page = Array.from({ length: 30 }, (_, index) => song(index + 1));
    const makeSDK = (describeSongList: NonNullable<QQMusicSDK["describeSongList"]>): QQMusicSDK => ({
      getAuthStatus: async () => true, goAuthPage: vi.fn(), describeSelfSongList: async () => [{ DissId: 7, DissName: "Repeat", SongNum: 70 }],
      describeSongList, describeRecentPlay: async () => ({ Data: { Song: [] } }),
    });
    const repeated = createQQMusicBrowserProvider(makeSDK(async () => ({ DissId: 7, TotalNum: 70, SongList: page })), true);
    await expect(repeated.getPlaylistTracks!("7")).rejects.toThrow("重复");
    const reordered = createQQMusicBrowserProvider(makeSDK(async ({ Page }) => ({ DissId: 7, TotalNum: 70,
      SongList: Page ? [...page].reverse() : page })), true);
    await expect(reordered.getPlaylistTracks!("7")).rejects.toThrow("重复");
    const empty = createQQMusicBrowserProvider(makeSDK(async ({ Page }) => ({ DissId: 7, TotalNum: 70, SongList: Page ? [] : page })), true);
    await expect(empty.getPlaylistTracks!("7")).rejects.toThrow("提前结束");
    const failed = createQQMusicBrowserProvider(makeSDK(async () => { throw new Error("SDK disconnected"); }), true);
    await expect(failed.getPlaylistTracks!("7")).rejects.toThrow("SDK disconnected");
    const failedHalfway = vi.fn(async ({ Page }: { DissId: number; Page: number; PageSize: number }) => {
      if (Page) throw new Error("SDK disconnected after page one");
      return { DissId: 7, TotalNum: 70, SongList: page };
    });
    await expect(createQQMusicBrowserProvider(makeSDK(failedHalfway), true).getPlaylistTracks!("7"))
      .rejects.toThrow("SDK disconnected after page one");
    expect(failedHalfway).toHaveBeenCalledTimes(2);
  });

  it("terminates at exact page boundaries and rejects inconsistent totals or empty-song contradictions", async () => {
    const all = Array.from({ length: 60 }, (_, index) => song(index + 1));
    const makeSDK = (describeSongList: NonNullable<QQMusicSDK["describeSongList"]>): QQMusicSDK => ({
      getAuthStatus: async () => true, goAuthPage: vi.fn(), describeSelfSongList: async () => [{ DissId: 7, DissName: "Boundary", SongNum: 60 }],
      describeSongList, describeRecentPlay: async () => ({ Data: { Song: [] } }),
    });
    const exactPages = vi.fn(async ({ Page }: { DissId: number; Page: number; PageSize: number }) => ({
      DissId: 7, TotalNum: 60, SongList: all.slice(Page * 30, (Page + 1) * 30),
    }));
    expect(await createQQMusicBrowserProvider(makeSDK(exactPages), true).getPlaylistTracks!("7")).toHaveLength(60);
    expect(exactPages).toHaveBeenCalledTimes(2);
    const zero = vi.fn(async () => ({ DissId: 7, TotalNum: 0, SongList: [] }));
    expect(await createQQMusicBrowserProvider(makeSDK(zero), true).getPlaylistTracks!("7")).toEqual([]);
    expect(zero).toHaveBeenCalledTimes(1);
    const changed = createQQMusicBrowserProvider(makeSDK(async ({ Page }) => ({ DissId: 7, TotalNum: Page ? 59 : 60,
      SongList: all.slice(Page * 30, (Page + 1) * 30) })), true);
    await expect(changed.getPlaylistTracks!("7")).rejects.toThrow("总数变化");
    const falseZero = createQQMusicBrowserProvider(makeSDK(async () => ({ DissId: 7, TotalNum: 0, SongList: [song(1)] })), true);
    await expect(falseZero.getPlaylistTracks!("7")).rejects.toThrow("空歌单返回了歌曲");
  });
});
