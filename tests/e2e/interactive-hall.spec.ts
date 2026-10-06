import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(90_000);

async function waitForMist(page: Page) {
  await expect(page.locator(".mw-fog-transition")).toHaveCount(0, { timeout: 20_000 });
}

async function hall(page: Page) {
  await expect(page.locator(".mw-hall-ready")).toBeVisible();
  await expect(page.locator("[data-portal]")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "进入专辑宇宙" })).toBeVisible();
  await waitForMist(page);
}

test("hall immediately offers only the album universe without film or music controls", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await hall(page);
  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("link")).toHaveCount(1);
  await expect(page.locator(".mw-hall-film, .mw-hall-canvas, .mw-hall-scrubber, .mw-hall-music-control")).toHaveCount(0);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const position = await page.getByTestId("hall-universe-entry").evaluate((element) => ({ left: (element as HTMLElement).style.left, top: (element as HTMLElement).style.top, width: (element as HTMLElement).style.width }));
  expect(position).toEqual({ left: "42.9%", top: "43.1%", width: "14%" });
  await page.mouse.wheel(0, 120);
  await page.mouse.wheel(0, -120);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(page.getByRole("slider")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/u);
  expect(errors).toEqual([]);
});

test("existing module hash routes still open directly and return to the simplified hall", async ({ page }) => {
  await page.goto("/#hall");
  await hall(page);
  for (const id of ["world", "library", "import", "demo", "journey", "guide", "qq"]) {
    await page.goto(`/#${id}`);
    await expect(page).toHaveURL(new RegExp(`#${id}$`, "u"));
    await waitForMist(page);
    await expect(page.locator("main")).toHaveAttribute("data-module", id);
    await page.getByRole("button", { name: "回到音乐大厅" }).click();
    await expect(page).toHaveURL(/#hall$/u);
    await hall(page);
  }
});

test("landscape keeps the single album entry label and touch target visible", async ({ page }) => {
  for (const size of [{ width: 844, height: 390 }, { width: 667, height: 375 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(size);
    await page.goto("/#hall");
    await hall(page);
    const targets = await page.locator("[data-portal]").evaluateAll((elements) => elements.map((element) => {
      const button = element.getBoundingClientRect();
      const label = element.querySelector(".mw-hotspot-label")!.getBoundingClientRect();
      return { id: element.getAttribute("data-portal"), size: Math.min(button.width, button.height), visible: label.left >= 0 && label.top >= 0 && label.right <= innerWidth && label.bottom <= innerHeight,
        hit: document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2)?.closest("[data-portal]")?.getAttribute("data-portal") };
    }));
    for (const target of targets) {
      expect(target.visible, `${target.id} label at ${size.width}x${size.height}`).toBe(true);
      expect(target.size).toBeGreaterThanOrEqual(44);
      expect(target.hit).toBe(target.id);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("rotating from landscape recenters the phone panorama", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/#hall");
  await hall(page);
  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(size);
    await expect.poll(() => page.locator("[data-portal]").evaluateAll((elements) => elements.every((element) => {
      const box = element.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("[data-portal]") === element;
    }))).toBe(true);
    const viewport = page.locator(".mw-hall-panorama");
    await expect.poll(() => viewport.evaluate((element) => Math.abs(element.scrollLeft - Math.max(0, element.scrollWidth * .429 - element.clientWidth / 2)))).toBeLessThan(1);
    const center = await viewport.evaluate((element) => {
      const initial = element.scrollLeft;
      element.scrollLeft = initial + 30;
      return initial;
    });
    await page.waitForTimeout(150);
    expect(await viewport.evaluate((element) => element.scrollLeft)).toBeCloseTo(center + 30, 0);
  }
});

test("phone tap and browser back use the album doorway without requiring the opening film", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await hall(page);
    await page.waitForTimeout(700);
    const hits = await page.locator("[data-portal]").evaluateAll((elements) => elements.every((element) => {
      const box = element.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("[data-portal]") === element;
    }));
    expect(hits).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && scrollY === 0)).toBe(true);
    const doorway = page.getByRole("link", { name: "进入专辑宇宙" });
    const destination = (await doorway.getAttribute("href"))!;
    await page.route(destination, (route) => route.fulfill({ contentType: "text/html", body: "<title>Album universe destination fixture</title>" }));
    await doorway.tap();
    await expect(page).toHaveURL(destination);
    await page.goBack();
    await hall(page);
  } finally { await context.close(); }
});

test("a real imported playlist opens its map, guide and saved five-stop journey", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#import");
  const rows = Array.from({ length: 6 }, (_, index) => ({ title: `Page Check ${index + 1}`, artist: "Page Check Artist", album: "Page Check Album", genre: "rock" }));
  await page.getByLabel("选择歌单文件").setInputFiles({ name: "page-check.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(rows)) });
  await page.getByRole("button", { name: "整理并预览歌单" }).click();
  await expect(page.getByTestId("stat-保留歌曲")).toHaveText("6");
  await page.getByRole("button", { name: "保存到我的音乐库", exact: true }).click();
  await expect(page).toHaveURL(/#library$/u);
  await waitForMist(page);
  await expect(page.getByTestId("library-歌曲")).toHaveText("6");
  await page.getByRole("button", { name: "生成音乐世界" }).click();
  await expect(page).toHaveURL(/\/world\/[\w-]+$/u);
  await waitForMist(page);
  await expect(page.locator(".react-flow__node")).not.toHaveCount(0);
  await page.locator(".guide-disclosure summary").click();
  await page.getByLabel("问问这个节点").fill("为什么这个节点在这里？");
  await page.getByRole("button", { name: "查看已有依据" }).click();
  await expect(page.locator(".guide-answer")).toBeVisible();
  await page.getByRole("button", { name: "从这里开启 5 站 Journey" }).click();
  await expect(page.locator(".journey-stops li")).toHaveCount(5);
  await waitForMist(page);
  await page.getByRole("link", { name: "打开路线详情" }).click();
  await expect(page).toHaveURL(/\/journey\/[\w-]+$/u);
  await waitForMist(page);
  await page.reload();
  await expect(page.locator(".journey-stops li")).toHaveCount(5);
  await page.getByRole("link", { name: "回到音乐大厅" }).click();
  await expect(page).toHaveURL(/\/#hall$/u);
  await hall(page);
  expect(errors).toEqual([]);
});

test("reduced motion and an unavailable background keep the album entry available", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await hall(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/scene-hall-2k.webp", (route) => route.abort());
  await page.goto("/");
  await hall(page);
  await expect(page.locator(".mw-hall-final")).toHaveCSS("background-image", /scene-hall.webp/u);
});

test("Demo opens a separate real world and unavailable official access offers file import", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#qq");
  const connector = page.getByRole("region", { name: "QQ 音乐官方连接" });
  await expect(connector.getByText("当前不可用", { exact: true })).toBeVisible();
  await expect(connector.getByRole("button", { name: "读取我的歌单" })).toHaveCount(0);
  await page.getByRole("button", { name: "改用歌单文件导入" }).click();
  await expect(page).toHaveURL(/#import$/u);
  await waitForMist(page);
  await expect(page.getByLabel("选择歌单文件")).toBeVisible();
  await page.getByRole("button", { name: "回到音乐大厅" }).click();
  await hall(page);
  await page.goto("/#demo");
  await waitForMist(page);
  await page.getByRole("button", { name: "打开 Demo 世界" }).click();
  await expect(page).toHaveURL(/\/world\/[\w-]+$/u);
  await waitForMist(page);
  const worldId = page.url().split("/").at(-1)!;
  const world = await (await page.request.get("/api/worlds/" + worldId)).json();
  expect(world.scope).toBe("demo");
  expect(world.totalTracks).toBe(60);
  expect((await (await page.request.get("/api/library")).json()).counts.tracks).toBe(0);
  await page.getByRole("button", { name: "从这里开启 5 站 Journey" }).click();
  await expect(page.locator(".journey-stops li")).toHaveCount(5);
  await waitForMist(page);
  await page.getByRole("link", { name: "打开路线详情" }).click();
  await expect(page).toHaveURL(/\/journey\/[\w-]+$/u);
  await waitForMist(page);
  await page.reload();
  await expect(page.locator(".journey-stops li")).toHaveCount(5);
  expect(errors).toEqual([]);
});
