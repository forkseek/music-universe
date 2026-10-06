import { test, expect, type Page } from "@playwright/test";

test.setTimeout(45000);
const songs = {
  light: { mid: "light001", name: "轻音乐测试", artist: "测试艺术家", album: "测试专辑" },
  sunny: { mid: "sunny001", name: "晴天", artist: "周杰伦", album: "叶惠美" },
  coast: { mid: "coast001", name: "搁浅", artist: "周杰伦", album: "七里香" },
  flower: { mid: "flower001", name: "花海", artist: "周杰伦", album: "魔杰座" },
  next: { mid: "next001", name: "七里香", artist: "周杰伦", album: "七里香" },
};
const profile = { id: "6789012", nickname: "音乐听众", avatar: "https://q1.qlogo.cn/g?b=qq&nk=4201337&s=100" };
const qrImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSAAAAABJRU5ErkJggg==";

async function fixtures(page: Page, expired = false) {
  const state = { loggedIn: false, pollCount: 0, qrCount: 0, requests: [] as string[], expiration: expired };
  // These are explicit UI fixtures. Real QR/search upstream checks run separately.
  await page.route("**/api/qq/**", async route => {
    const url = new URL(route.request().url());
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/qq/session") return reply({ ready: true });
    if (url.pathname === "/api/qq/status") return reply({ configured: true, authorized: state.loggedIn, message: state.loggedIn ? "已连接音乐听众" : "请扫码登录", ...(state.loggedIn ? { nickname: profile.nickname, user: profile } : {}) });
    if (url.pathname === "/api/qq/login/qr") { state.qrCount++; state.pollCount = 0; return reply({ provider: "qq", image: qrImage, loginId: "qr-fixture-" + state.qrCount, expiresAt: Date.now() + 180000, expiresIn: 180000 }); }
    if (url.pathname === "/api/qq/login/poll") {
      state.requests.push(url.searchParams.get("loginId") ?? ""); state.pollCount++;
      if (state.expiration) return reply({ provider: "qq", status: "expired", message: "二维码已过期，请刷新后重新扫码。" });
      if (state.pollCount < 2) return reply({ provider: "qq", status: "scanned", message: "已扫码，请在手机上确认登录。" });
      state.loggedIn = true; return reply({ provider: "qq", status: "success", nickname: profile.nickname, user: profile, message: "QQ 音乐登录成功。" });
    }
    if (url.pathname === "/api/qq/login/logout") { state.loggedIn = false; return reply({ ok: true, message: "已退出 QQ 音乐账号。" }); }
    if (url.pathname === "/api/qq/lyric") return reply({ lyric: "" });
    if (url.pathname === "/api/qq/song/url") return reply({ playable: false, url: "", message: "测试不请求音乐音频。" });
    if (url.pathname === "/api/qq/search") {
      const query = url.searchParams.get("keywords") ?? "", current = Number(url.searchParams.get("page") ?? 1);
      if (query === "慢搜索") await new Promise(resolve => setTimeout(resolve, 1000));
      const selected = query === "晴天" ? current === 1 ? [songs.sunny, songs.coast] : [songs.next] : query === "花海" ? [songs.flower] : query === "不存在" ? [] : [songs.light];
      return reply({ provider: "qq", songs: selected.map(song => ({ ...song, provider: "qq", mediaMid: song.mid, qqId: "100", albumMid: "album001", cover: "/media/scene-light.webp", duration: 269000, fee: 0 })), query, page: current, hasMore: query === "晴天" && current === 1 });
    }
    return reply({ error: { message: "Unknown fixture request" } }, 404);
  });
  await page.route("https://q1.qlogo.cn/**", route => route.fulfill({ contentType: "image/png", body: Buffer.from(qrImage.split(",")[1], "base64") }));
  await page.goto("/#world");
  await expect(page.getByRole("textbox", { name: "搜索 QQ 音乐", exact: true })).toBeVisible();
  return state;
}

test("QQ search presents only the current query, loads pages, handles empty results and keeps the listening room", async ({ page }) => {
  await fixtures(page);
  const input = page.getByRole("textbox", { name: "搜索 QQ 音乐", exact: true });
  await input.fill("晴天"); await input.press("Enter");
  const results = page.getByRole("dialog", { name: "QQ 音乐搜索结果", exact: true });
  await expect(results.getByRole("listitem")).toHaveCount(2);
  await expect(results).toContainText("周杰伦 · 叶惠美");
  await expect(results.getByRole("link", { name: "在 QQ 音乐查看 晴天" })).toHaveAttribute("href", "https://y.qq.com/n/ryqq/songDetail/sunny001");
  await results.getByRole("button", { name: "加载更多结果" }).click();
  await expect(results.getByRole("listitem")).toHaveCount(3);
  await input.fill("花海"); await input.press("Enter");
  await expect(results.getByRole("listitem")).toHaveCount(1);
  await expect(results).toContainText("花海"); await expect(results).not.toContainText("晴天");
  await input.fill("不存在"); await input.press("Enter");
  await expect(results.getByRole("listitem")).toHaveCount(0);
  await expect(results).toContainText("没有找到对应的歌曲");
  await input.fill("慢搜索"); await input.press("Enter");
  await input.fill("花海"); await input.press("Enter");
  await expect(results.getByRole("listitem")).toHaveCount(1);
  await page.waitForTimeout(1200); await expect(results).toContainText("花海");
  await expect(page).toHaveURL(/#world$/);
});

test("QQ QR confirmation shows public identity, restores it on reload and allows logout", async ({ page }) => {
  const state = await fixtures(page);
  await page.getByRole("button", { name: "查看 QQ 音乐连接状态", exact: true }).click();
  await page.getByRole("button", { name: "扫码登录 QQ 音乐", exact: true }).click();
  const qr = page.getByRole("dialog", { name: "扫码登录 QQ 音乐", exact: true });
  await expect(qr.getByRole("img", { name: "QQ 音乐登录二维码" })).toBeVisible();
  await expect(qr).toContainText("已扫码", { timeout: 10000 });
  await expect(qr).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByLabel("QQ 音乐用户信息")).toContainText("音乐听众");
  await expect(page.getByLabel("QQ 音乐用户信息")).toContainText("6789012");
  expect(state.requests).toEqual(["qr-fixture-1", "qr-fixture-1"]);
  await page.reload();
  await expect(page.getByRole("button", { name: "查看 QQ 音乐连接状态", exact: true })).toContainText("音乐听众");
  await page.getByRole("button", { name: "查看 QQ 音乐连接状态", exact: true }).click();
  await page.getByRole("button", { name: "退出登录 QQ 音乐", exact: true }).click();
  await expect(page.getByLabel("QQ 音乐用户信息")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "扫码登录 QQ 音乐", exact: true })).toBeVisible();
});

test("expired QR can be refreshed and closing its dialog stops polling", async ({ page }) => {
  const state = await fixtures(page, true);
  await page.getByRole("button", { name: "查看 QQ 音乐连接状态", exact: true }).click();
  await page.getByRole("button", { name: "扫码登录 QQ 音乐", exact: true }).click();
  await expect(page.getByRole("button", { name: "刷新二维码", exact: true })).toBeVisible({ timeout: 10000 });
  state.expiration = false;
  await page.getByRole("button", { name: "刷新二维码", exact: true }).click();
  expect(state.qrCount).toBe(2);
  await page.getByRole("button", { name: "关闭扫码登录", exact: true }).click();
  const count = state.requests.length;
  await page.waitForTimeout(3000); expect(state.requests).toHaveLength(count);
});

test("mobile layout keeps QQ login and search accessible without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await expect(page.getByRole("button", { name: "查看 QQ 音乐连接状态", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "搜索 QQ 音乐", exact: true }).fill("晴天");
  await page.getByRole("button", { name: "搜索歌曲", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "QQ 音乐搜索结果", exact: true }).getByRole("listitem")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
