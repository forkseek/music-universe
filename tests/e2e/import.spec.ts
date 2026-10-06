import { expect, test } from "@playwright/test";
import path from "node:path";

test("homepage samples combine three formats and export a consistent collection", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("让散落的歌单");
  await page.getByRole("link", { name: "上传歌单" }).click();
  await expect(page.getByRole("heading", { name: "带上你的歌单" })).toBeInViewport();
  await expect(page.getByRole("link", { name: "Try Demo" })).toHaveAttribute("href", "#library-title");
  await page.screenshot({ path: "test-results/d6-home.png", fullPage: true });
  await page.getByRole("button", { name: "体验三种格式样例" }).click();
  await expect(page.getByTestId("stat-总记录")).toHaveText("9");
  await expect(page.getByTestId("stat-有效记录")).toHaveText("9");
  await expect(page.getByTestId("stat-合并重复")).toHaveText("6");
  await expect(page.getByTestId("stat-保留歌曲")).toHaveText("3");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expect(page.getByText("Demo Music Library · 样例预览")).toBeVisible();
  await page.getByText("3 条来源").first().click();
  await expect(page.locator("tbody tr").first()).toContainText("playlist.csv");
  await expect(page.locator("tbody tr").first()).toContainText("playlist.json");
  await expect(page.locator("tbody tr").first()).toContainText("playlist.txt");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载结果 JSON" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("music-world-collection.json");
  expect(await download.failure()).toBeNull();
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/import-preview.png", fullPage: true });
});

test("manual file selection protects versions and reports malformed files", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("选择歌单文件").setInputFiles(["versions.json", "broken.csv", "ambiguous.txt", "empty.txt"].map((name) => path.resolve("public/samples", name)));
  await page.getByRole("button", { name: "Build My Music World" }).click();
  await expect(page.getByTestId("stat-保留歌曲")).toHaveText("5");
  const problems = page.getByRole("alert").filter({ hasText: "个问题需要处理" });
  await expect(problems).toContainText("CSV 格式损坏");
  await expect(problems).toContainText("有歧义");
  await expect(problems).toContainText("文件为空");
  await expect(page.locator("tbody")).toContainText("Version Test (Live)");
  await expect(page.locator("tbody")).toContainText("Version Test (Remix)");
});

test("mobile layout remains usable and provider API reports actual readiness", async ({ page, request }) => {
  const response = await request.get("/api/providers");
  expect(response.ok()).toBe(true);
  const providers = await response.json();
  expect(providers.filter((provider: { available: boolean }) => provider.available).map((provider: { id: string }) => provider.id)).toEqual(["file", "demo"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "体验三种格式样例" }).click();
  await expect(page.getByTestId("stat-保留歌曲")).toHaveText("3");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/import-mobile.png", fullPage: true });
});

test("a declared Spotify file source is saved and linked without claiming account authorization", async ({ page, request }) => {
  const statuses = await (await request.get("/api/providers")).json();
  expect(statuses.map((provider: { id: string }) => provider.id)).toEqual(["file", "qqmusic", "netease", "kugou", "qishui", "spotify", "demo"]);
  expect(statuses.find((provider: { id: string }) => provider.id === "spotify")).toMatchObject({ available: false, capabilities: { auth: false, fileImport: true } });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "音乐来源状态" })).toContainText("酷狗音乐");
  await expect(page.getByRole("region", { name: "音乐来源状态" })).toContainText("汽水音乐");
  await expect(page.getByRole("region", { name: "音乐来源状态" })).toContainText("Spotify");
  await page.getByLabel("文件声明的来源").selectOption("spotify");
  await page.getByLabel("选择歌单文件").setInputFiles({ name: "my-export.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([{ title: "My Song", artist: "Artist", externalUrl: "https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6?si=private" }])) });
  await page.getByRole("button", { name: "Build My Music World" }).click();
  await expect(page.locator("tbody")).toContainText("spotify");
  await page.getByRole("button", { name: "保存到我的音乐库" }).click();
  await expect(page.getByTestId("library-歌曲")).toHaveText("1");
  await page.getByRole("button", { name: "生成并保存音乐世界" }).click();
  await expect(page).toHaveURL(/\/world\/[\w-]+$/u);
  const link = page.getByRole("link", { name: "前往Spotify" });
  await expect(link).toHaveAttribute("href", "https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
});
