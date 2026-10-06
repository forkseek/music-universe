import { expect, test } from "@playwright/test";
import path from "node:path";
import type { MusicWorld } from "../../src/types/world";

const headers = { "X-Music-World": "1" };

test("save three file formats, refresh, reuse import, create and reopen world", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByTestId("library-歌曲")).toHaveText("0");
  await page.getByLabel("选择歌单文件").setInputFiles(["playlist.csv", "playlist.json", "playlist.txt"].map((name) => path.resolve("public/samples", name)));
  await page.getByRole("button", { name: "Build My Music World" }).click();
  await page.getByRole("button", { name: "保存到我的音乐库" }).click();
  await expect(page.getByRole("region", { name: "带上你的歌单" }).getByRole("status")).toContainText("新增 3 首歌曲、9 条来源");
  await expect(page.getByTestId("library-歌曲")).toHaveText("3");
  await page.getByRole("button", { name: "保存到我的音乐库" }).click();
  await expect(page.getByRole("region", { name: "带上你的歌单" }).getByRole("status")).toContainText("无新增重复记录");
  await page.reload();
  await expect(page.getByTestId("library-歌曲")).toHaveText("3");
  await expect(page.getByTestId("library-来源")).toHaveText("9");
  await page.getByLabel("世界名称").fill("三份歌单的世界");
  await page.getByRole("button", { name: "生成并保存音乐世界" }).click();
  await expect(page).toHaveURL(/\/world\/[\w-]+$/u);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("三份歌单的世界");
  await expect(page.getByTestId("music-map")).toBeVisible();
  await expect.poll(async () => page.locator(".react-flow__node").evaluateAll((elements) => {
    const map = elements[0]?.closest(".music-map")?.getBoundingClientRect();
    return elements.length === 3 && !!map && elements.every((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= map.left && bounds.right <= map.right && bounds.top >= map.top && bounds.bottom <= map.bottom;
    });
  })).toBe(true);
  await page.locator(".react-flow__node").filter({ hasText: "Let Down" }).click();
  await expect(page.getByTestId("music-card")).toContainText("Let Down");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/d6-music-card.png", fullPage: true });
  await page.locator(".react-flow__node").filter({ hasText: "Let Down" }).hover();
  await expect(page.locator(".map-hint")).toContainText("悬停：Let Down");
  await page.getByRole("button", { name: "从此节点生成 5 站 Journey" }).click();
  await expect(page.locator(".journey-stops li")).toHaveCount(3);
  await expect(page.locator(".journey-edge")).toHaveCount(2);
  const detailLink = page.getByRole("link", { name: "打开路线详情" });
  const detailUrl = await detailLink.getAttribute("href");
  await detailLink.click();
  await expect(page).toHaveURL(/\/journey\/[\w-]+$/u);
  await expect(page.locator(".journey-edge")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".journey-stops li")).toHaveCount(3);
  // The saved route can be reopened directly after a page refresh.
  await page.goto(detailUrl!);
  await expect(page.locator(".journey-edge")).toHaveCount(2);
  await page.goto("/");
  await page.getByRole("link", { name: "三份歌单的世界" }).click();
  await expect(page).toHaveURL(/\/world\/[\w-]+$/u);
  const savedUrl = page.url();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("三份歌单的世界");
  await page.goto("/");
  await page.getByRole("link", { name: "三份歌单的世界" }).click();
  await expect(page).toHaveURL(savedUrl);
  expect(errors).toEqual([]);
});

test("curated Demo stays separate, yields bounded graph, supports mobile and own-data deletion", async ({ page, browser }) => {
  const remoteRequests: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if ((url.protocol === "http:" || url.protocol === "https:") && !["127.0.0.1", "localhost"].includes(url.hostname)) {
      remoteRequests.push(url.origin);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Try Demo" }).click();
  await expect(page.getByRole("heading", { name: "我的音乐库" })).toBeInViewport();
  await page.getByRole("button", { name: "载入 60 首 Demo" }).click();
  await expect(page.getByTestId("library-歌曲")).toHaveText("60");
  await expect(page.getByTestId("library-艺术家")).toHaveText("20");
  await page.getByRole("button", { name: "载入 60 首 Demo" }).click();
  await expect(page.getByTestId("library-歌曲")).toHaveText("60");
  await page.getByRole("button", { name: "生成并保存音乐世界" }).click();
  await expect(page).toHaveURL(/\/world\/[\w-]+$/u);
  await expect(page.locator(".react-flow__node")).toHaveCount(30);
  await expect.poll(async () => page.locator(".music-flow-node.is-active").evaluate((element) => {
    const node = element.getBoundingClientRect();
    const map = element.closest(".music-map")!.getBoundingClientRect();
    return node.width >= 100 && node.left >= map.left && node.right <= map.right;
  })).toBe(true);
  const firstCardTitle = await page.locator(".node-inspector h2").innerText();
  await page.locator(".card-edges button").first().click();
  await expect(page.locator(".node-inspector h2")).not.toHaveText(firstCardTitle);
  await expect(page.locator(".music-flow-node.is-active")).toContainText(await page.locator(".node-inspector h2").innerText());
  const quickTarget = await page.locator("#node-picker option").nth(2).getAttribute("value");
  await page.getByLabel("快速定位节点").selectOption(quickTarget!);
  await expect(page.locator(`.react-flow__node[data-id="${quickTarget}"] .music-flow-node`)).toHaveClass(/is-active/u);
  await page.getByRole("button", { name: "从此节点生成 5 站 Journey" }).click();
  await expect(page.locator(".journey-stops li")).toHaveCount(5);
  await expect(page.locator(".journey-edge")).toHaveCount(4);
  await page.locator(".journey-stops li").last().getByRole("button").click();
  const lastTitle = await page.locator(".journey-stops li").last().locator("strong").innerText();
  await expect(page.locator(".music-flow-node.is-active")).toContainText(lastTitle);
  await expect.poll(async () => page.locator(".music-flow-node.is-active").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const map = element.closest(".music-map")!.getBoundingClientRect();
    return bounds.left >= map.left && bounds.right <= map.right && bounds.top >= map.top && bounds.bottom <= map.bottom;
  })).toBe(true);
  await expect(page.getByRole("button", { name: "从此节点生成 5 站 Journey" })).toBeEnabled();
  await page.getByRole("button", { name: "从此节点生成 5 站 Journey" }).click();
  await expect(page.locator(".journey-stops li")).toHaveCount(5);
  await expect(page.locator(".journey-stops li").first().locator("strong")).toHaveText(lastTitle);
  await page.getByRole("link", { name: "打开路线详情" }).click();
  await expect(page).toHaveURL(/\/journey\/[\w-]+$/u);
  const journeyId = page.url().split("/").at(-1)!;
  await page.reload();
  await expect(page.locator(".journey-edge")).toHaveCount(4);
  await page.waitForTimeout(550);
  await page.screenshot({ path: "test-results/d3-journey-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".journey-edge")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect.poll(async () => page.locator(".music-flow-node.is-route-stop").evaluateAll((elements) => {
    const map = elements[0]?.closest(".music-map")?.getBoundingClientRect();
    return elements.length === 5 && !!map && elements.every((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= map.left && bounds.right <= map.right && bounds.top >= map.top && bounds.bottom <= map.bottom;
    });
  })).toBe(true);
  await page.screenshot({ path: "test-results/d3-journey-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("link", { name: "返回音乐世界" }).click();
  await expect(page).toHaveURL(/\/world\/[\w-]+$/u);
  const worldId = page.url().split("/").at(-1)!;
  const response = await page.request.get(`/api/worlds/${worldId}`);
  expect(response.ok()).toBe(true);
  const world: MusicWorld = await response.json();
  expect(world.totalTracks).toBe(60);
  expect(world.nodes.length).toBeGreaterThanOrEqual(15);
  expect(world.nodes.length).toBeLessThanOrEqual(30);
  const ids = new Set(world.nodes.map((node) => node.id));
  expect(world.edges.length).toBeGreaterThan(0);
  for (const edge of world.edges) {
    expect(ids.has(edge.source) && ids.has(edge.target)).toBe(true);
    expect(edge.reason.length).toBeGreaterThan(0);
    expect(edge.evidence.trackIds.length).toBeGreaterThan(0);
  }
  await page.screenshot({ path: "test-results/d2-world-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator(".react-flow__controls-button")).toHaveCount(3);
  await expect.poll(async () => page.locator(".music-flow-node.is-active").evaluate((element) => {
    const node = element.getBoundingClientRect();
    const map = element.closest(".music-map")!.getBoundingClientRect();
    return node.left >= map.left && node.right <= map.right && node.top >= map.top && node.bottom <= map.bottom
      && node.width >= 100;
  })).toBe(true);
  await page.screenshot({ path: "test-results/d2-world-mobile.png", fullPage: true });

  const outsider = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  try {
    expect((await outsider.request.get("/api/library")).ok()).toBe(true);
    expect((await outsider.request.get(`/api/worlds/${worldId}`)).status()).toBe(404);
    expect((await outsider.request.get(`/api/journeys/${journeyId}`)).status()).toBe(404);
    await outsider.request.post("/api/imports/demo", { headers });
    await page.goto("/");
    await expect(page.getByTestId("library-歌曲")).toHaveText("0");
    await page.getByRole("button", { name: "清空当前会话音乐库" }).click();
    await page.getByRole("button", { name: "确认清空我的数据" }).click();
    await expect(page.getByRole("button", { name: "清空当前会话音乐库" })).toBeVisible();
    expect((await page.request.get(`/api/worlds/${worldId}`)).status()).toBe(404);
    expect((await page.request.get(`/api/journeys/${journeyId}`)).status()).toBe(404);
    expect((await (await page.request.get("/api/library?scope=demo")).json()).counts.tracks).toBe(0);
    expect((await (await outsider.request.get("/api/library?scope=demo")).json()).counts.tracks).toBe(60);
  } finally { await outsider.close(); }
  expect(remoteRequests).toEqual([]);
});

test("a validated source page appears on a song card without proxying audio", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("library-歌曲")).toHaveText("0");
  const rows = [
    { title: "Linked Song", artist: "Test Artist", album: "Test Album", genre: "rock", provider: "netease", externalUrl: "https://music.163.com/song?id=123" },
    ...Array.from({ length: 4 }, (_, index) => ({ title: `More Song ${index + 1}`, artist: "Test Artist", album: "Test Album", genre: "rock" })),
  ];
  await page.getByLabel("选择歌单文件").setInputFiles({ name: "linked.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(rows)) });
  await page.getByRole("button", { name: "Build My Music World" }).click();
  await page.getByRole("button", { name: "保存到我的音乐库" }).click();
  await expect(page.getByTestId("library-歌曲")).toHaveText("5");
  await page.getByRole("button", { name: "生成并保存音乐世界" }).click();
  await expect(page).toHaveURL(/\/world\/[\w-]+$/u);
  await page.locator(".react-flow__node").filter({ hasText: "Linked Song" }).click();
  const link = page.getByRole("link", { name: "前往网易云音乐" });
  await expect(link).toHaveAttribute("href", "https://music.163.com/song?id=123");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await page.getByRole("button", { name: "从此节点生成 5 站 Journey" }).click();
  await expect(page.locator(".journey-stops li")).toHaveCount(5);
  await expect(page.locator(".journey-edge")).toHaveCount(4);
});

test("Guide facts and a natural language direction update the saved route without a model key", async ({ page }) => {
  await page.goto("/");
  const rows = [
    { title: "Anchor", artist: "Start", genre: "rock" },
    { title: "Alpha", artist: "A", genre: "rock" },
    { title: "Beta", artist: "B", genre: "rock" },
    { title: "Dream One", artist: "C", genre: "dream pop" },
    { title: "Dream Two", artist: "D", genre: "shoegaze" },
    { title: "Gamma", artist: "E", genre: "ambient" },
  ];
  await page.getByLabel("选择歌单文件").setInputFiles({ name: "direction.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(rows)) });
  await page.getByRole("button", { name: "Build My Music World" }).click();
  await page.getByRole("button", { name: "保存到我的音乐库" }).click();
  await expect(page.getByTestId("library-歌曲")).toHaveText("6");
  await page.getByRole("button", { name: "生成并保存音乐世界" }).click();
  await expect(page).toHaveURL(/\/world\/[\w-]+$/u);
  const worldId = page.url().split("/").at(-1)!;
  const anchorNode = page.locator(".react-flow__node").filter({ hasText: "Anchor" });
  const startNodeId = await anchorNode.getAttribute("data-id");
  expect((await page.request.post("/api/journeys", { headers, data: { worldId, startNodeId, intent: "x".repeat(121) } })).status()).toBe(400);
  await anchorNode.click();
  const compareBox = await page.getByLabel("比较的节点（选填）").boundingBox();
  const questionBox = await page.getByLabel("问问这个节点").boundingBox();
  expect(compareBox && questionBox && questionBox.y > compareBox.y + compareBox.height).toBe(true);
  await page.getByLabel("探索方向（选填）").fill("往摇滚方向走");
  await page.getByRole("button", { name: "从此节点生成 5 站 Journey" }).click();
  await expect(page.locator(".journey-stops li")).toHaveCount(5);
  await expect(page.locator(".journey-edge")).toHaveCount(4);
  await expect(page.locator(".journey-intent-summary")).toContainText("往摇滚方向走");
  await expect(page.locator(".journey-panel-title")).toContainText("基础路线");
  const baselineTitles = await page.locator(".journey-stops li strong").allTextContents();
  const savedWorld = await (await page.request.get(`/api/worlds/${worldId}`)).json() as MusicWorld;
  const directEdge = savedWorld.edges.find((edge) => edge.source === startNodeId || edge.target === startNodeId);
  expect(directEdge).toBeDefined();
  const targetId = directEdge!.source === startNodeId ? directEdge!.target : directEdge!.source;
  await page.getByLabel("比较的节点（选填）").selectOption(targetId);
  await page.getByRole("button", { name: "查看已有依据" }).click();
  await expect(page.locator(".guide-answer")).toContainText(directEdge!.reason);
  expect((await page.request.post("/api/guide", { headers, data: {
    worldId, nodeId: startNodeId, targetNodeId: startNodeId, question: "为什么连接？",
  } })).status()).toBe(400);
  expect((await page.request.post("/api/guide", { headers, data: {
    worldId, nodeId: startNodeId, targetNodeId: crypto.randomUUID(), question: "为什么连接？",
  } })).status()).toBe(404);
  await page.getByLabel("比较的节点（选填）").selectOption("");
  await page.getByLabel("问问这个节点").fill("为什么这个节点在这里？");
  await page.getByRole("button", { name: "查看已有依据" }).click();
  await expect(page.locator(".guide-answer")).toContainText("Anchor");
  await expect(page.locator(".guide-answer")).toContainText("依据");
  await page.getByLabel("问问这个节点").fill("更梦幻一点");
  await page.getByRole("button", { name: "查看已有依据" }).click();
  await expect(page.locator(".guide-answer")).toContainText("已导入的流派标签");
  const suggested = page.locator(".guide-recommendations button").first();
  await expect(suggested).toBeVisible();
  const suggestedLabel = (await suggested.textContent())!.match(/「(.+?)」/u)![1];
  await page.getByRole("button", { name: "沿这个方向生成 Journey" }).click();
  await expect(page.locator(".journey-intent-summary")).toContainText("更梦幻一点");
  await expect(page.locator(".journey-stops")).toContainText("已导入流派标签");
  expect(await page.locator(".journey-stops li strong").allTextContents()).not.toEqual(baselineTitles);
  await expect(page.locator(".journey-edge")).toHaveCount(4);
  expect((await page.request.post("/api/guide", { headers, data: { worldId, nodeId: crypto.randomUUID(), question: "为什么？" } })).status()).toBe(404);
  await page.screenshot({ path: "test-results/d5-guide-route.png", fullPage: true });
  await page.locator(".guide-panel").screenshot({ path: "test-results/d5-guide-answer.png" });
  await suggested.click();
  await expect(page.locator(".node-inspector h2")).toHaveText(suggestedLabel);
  await page.getByLabel("问问这个节点").fill("不要太吵");
  await page.getByRole("button", { name: "查看已有依据" }).click();
  await expect(page.locator(".guide-answer")).toContainText("响度");
  await expect(page.getByRole("button", { name: "沿这个方向生成 Journey" })).toHaveCount(0);
  await page.route("**/api/guide", (route) => route.abort());
  await page.getByLabel("问问这个节点").fill("为什么连接？");
  await page.getByRole("button", { name: "查看已有依据" }).click();
  await expect(page.locator(".guide-panel [role='alert']")).toBeVisible();
  await expect(page.locator(".journey-stops li")).toHaveCount(5);
  await page.unroute("**/api/guide");
  await page.route("**/api/guide", async (route) => { await new Promise((resolve) => setTimeout(resolve, 250)); await route.continue(); });
  await page.getByLabel("问问这个节点").fill("有哪些歌曲？");
  await page.getByRole("button", { name: "查看已有依据" }).click();
  await expect(page.getByRole("button", { name: "正在查找依据" })).toBeDisabled();
  await expect(page.locator(".guide-answer")).toContainText("关联的已导入歌曲");
  await page.unroute("**/api/guide");
  await page.getByRole("link", { name: "打开路线详情" }).click();
  await expect(page).toHaveURL(/\/journey\/[\w-]+$/u);
  await page.reload();
  await expect(page.locator(".journey-stops li")).toHaveCount(5);
  await expect(page.locator(".journey-intent-summary")).toContainText("更梦幻一点");
  await expect(page.locator(".journey-edge")).toHaveCount(4);
});

test("API validates origin, ownership, raw input, size limits and broken files", async ({ request }) => {
  const initial = await request.get("/api/library");
  expect(initial.headers()["cache-control"]).toContain("no-store");
  expect(initial.headers()["set-cookie"]).toMatch(/HttpOnly/iu);
  expect((await request.post("/api/imports/demo")).status()).toBe(403);
  expect((await request.delete("/api/library", { headers: { ...headers, Origin: "https://unrelated.invalid" } })).status()).toBe(403);
  expect((await request.post("/api/worlds", { headers, data: { name: "Empty" } })).status()).toBe(422);
  expect((await request.post("/api/worlds", { headers, data: { name: "Injected", userId: "other-user" } })).status()).toBe(400);
  expect((await request.post("/api/worlds", { headers, data: "{" })).status()).toBe(400);
  expect((await request.post("/api/music/normalize", { headers, data: "x".repeat(2 * 1024 * 1024 + 1) })).status()).toBe(413);
  const normalized = await request.post("/api/music/normalize", { headers, data: [{ title: "Valid", artist: "Artist" }] });
  expect((await normalized.json()).stats.uniqueTracks).toBe(1);
  expect((await (await request.get("/api/library")).json()).counts.tracks).toBe(0);
  const bad = await request.post("/api/imports/file", { headers, multipart: { files: { name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{") } } });
  expect(bad.ok()).toBe(true);
  const report = (await bad.json()).report;
  expect(report.tracks).toEqual([]);
  expect(report.errors[0].message).toContain("JSON");
  const library = await (await request.get("/api/library")).json();
  expect(library.counts.tracks).toBe(0);
  expect(library.imports[0].status).toBe("failed");
});
