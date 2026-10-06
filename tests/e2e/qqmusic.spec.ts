import { expect, test } from "@playwright/test";

test("ordinary browsers do not claim QQ authorization", async ({ page }) => {
  await page.goto("/");
  const connector = page.getByRole("region", { name: "QQ 音乐官方连接" });
  await expect(connector).toContainText("当前不可用");
  await expect(connector.getByRole("button", { name: "前往官方授权" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "体验三种格式样例" })).toBeVisible();
});

test("QQ import route stays closed while the feature flag is off", async ({ request }) => {
  test.skip(process.env.NEXT_PUBLIC_ENABLE_QQMUSIC === "true", "The flag-on path is covered by the SDK stand-in test.");
  const response = await request.post("/api/imports/qqmusic", { headers: { "X-Music-World": "1" },
    data: { kind: "recent", tracks: [{ title: "Song", artists: ["Singer"], externalId: "77" }] } });
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe("FEATURE_DISABLED");
});

test("QQ SDK stand-in imports a 65-song playlist and recent play through the guarded adapter", async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_ENABLE_QQMUSIC !== "true", "Run with NEXT_PUBLIC_ENABLE_QQMUSIC=true to exercise the SDK stand-in.");
  await page.addInitScript(() => {
    const browser = window as Window & { h5PanelSdk?: unknown; __testQQAuth?: boolean };
    browser.__testQQAuth = true;
    const songs = Array.from({ length: 65 }, (_, index) => ({ SongId: index + 1, SongName: `QQ Track ${index + 1}`,
      SingerName: "QQ Artist", AlbumName: "QQ Album", SongPlayTime: 180, SongPlayUrl: "https://private.invalid/audio.mp3" }));
    browser.h5PanelSdk = { qqMusic: {
      getAuthStatus: async () => browser.__testQQAuth === true, goAuthPage: () => {},
      describeSelfSongList: async () => [{ DissId: 123, DissName: "SDK 测试歌单", SongNum: 65 }],
      describeSongList: async ({ DissId, Page, PageSize }: { DissId: number; Page: number; PageSize: number }) => ({
        DissId, TotalNum: songs.length, SongList: songs.slice(Page * PageSize, (Page + 1) * PageSize),
      }),
      describeRecentPlay: async () => ({ Data: { Song: [{ Id: 1, Title: "QQ Track 1", Singer: ["QQ Artist"], AlbumTitle: "QQ Album" }] } }),
    } };
  });
  await page.goto("/");
  const connector = page.getByRole("region", { name: "QQ 音乐官方连接" });
  await expect(connector).toContainText("当前面板报告已授权");
  await connector.getByRole("button", { name: "读取我的歌单" }).click();
  await expect(connector.getByLabel("选择个人歌单")).toHaveValue("123");
  await connector.getByRole("button", { name: "导入所选歌单" }).click();
  await expect(page.getByTestId("library-歌曲")).toHaveText("65");
  await expect(page.getByTestId("library-来源")).toHaveText("65");
  await connector.getByRole("button", { name: "导入所选歌单" }).click();
  await expect(connector).toContainText("这批音乐已导入过");
  await expect(page.getByTestId("library-歌曲")).toHaveText("65");
  await connector.getByRole("button", { name: "导入最近播放" }).click();
  await expect(page.getByTestId("library-来源")).toHaveText("66");
  await page.evaluate(() => { (window as Window & { __testQQAuth?: boolean }).__testQQAuth = false; });
  await connector.getByRole("button", { name: "导入最近播放" }).click();
  await expect(connector).toContainText("尚未完成 QQ 音乐授权");
  await expect(connector.getByRole("button", { name: "导入所选歌单" })).toHaveCount(0);
  await page.getByRole("button", { name: "生成并保存音乐世界" }).click();
  await expect(page).toHaveURL(/\/world\/[\w-]+$/u);
  const count = Number(await page.getByTestId("world-node-count").textContent());
  expect(count).toBeGreaterThanOrEqual(15);
  expect(count).toBeLessThanOrEqual(30);
  await page.waitForTimeout(800); // Allow the map's initial fit animation to finish before capturing the visual artifact.
  await page.screenshot({ path: "test-results/d5-qq-sdk-standin.png", fullPage: true });
});
