import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(90_000);

async function waitForMist(page: Page) {
  await expect(page.locator(".mw-fog-transition")).toHaveCount(0, { timeout: 20_000 });
}

async function hall(page: Page) {
  await expect(page.locator(".mw-hall-ready")).toBeVisible();
  await expect(page.locator("[data-portal]")).toHaveCount(7);
  await waitForMist(page);
}

test("wheel advances and reverses the continuous film without scrolling the page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const canvas = page.locator(".mw-hall-canvas.is-painted");
  await expect(canvas).toBeVisible();
  const firstFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  const opacity = () => page.locator(".mw-interactive-hall").evaluate((element) => Number((element as HTMLElement).style.getPropertyValue("--intro-opacity")));
  await page.mouse.move(800, 450);
  for (let step = 0; step < 5; step++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(160);
  }
  await expect.poll(opacity).toBeLessThan(.8);
  expect(await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(firstFrame);
  for (let step = 0; step < 6; step++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(160);
  }
  await expect.poll(opacity).toBeGreaterThan(.98);
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(firstFrame);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(page.getByRole("slider")).toHaveCount(0);
  const timeline = await (await page.request.get("/media/music-world-continuous/timeline.json")).json();
  expect(timeline.fps).toBe(60);
  expect(timeline.frameCount).toBeGreaterThan(700);
  await page.getByRole("button", { name: "自动漫游" }).click();
  await expect(page.locator(".mw-hall-ready")).toBeVisible({ timeout: 35_000 });
  await hall(page);
  await page.mouse.wheel(0, -120);
  await expect(page.locator(".mw-hall-arrival .mw-hall-canvas.is-painted")).toBeVisible();
  expect(errors).toEqual([]);
});

test("all seven icons use mist transitions and return to the final frame", async ({ page }) => {
  await page.goto("/#hall");
  await hall(page);
  for (const id of ["world", "library", "import", "demo", "journey", "guide", "qq"]) {
    await page.locator(`[data-portal="${id}"]`).click();
    await expect(page.locator(".mw-fog-transition")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#${id}$`, "u"));
    await waitForMist(page);
    await expect(page.locator("main")).toHaveAttribute("data-module", id);
    await page.getByRole("button", { name: "回到音乐大厅" }).click();
    await expect(page).toHaveURL(/#hall$/u);
    await hall(page);
  }
  await page.getByRole("button", { name: "重新唤醒" }).click();
  await expect(page.locator(".mw-hall-arrival .mw-hall-canvas.is-painted")).toBeVisible();
});

test("landscape keeps all icon labels and touch targets visible", async ({ page }) => {
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
    await expect.poll(() => viewport.evaluate((element) => Math.abs(element.scrollLeft - Math.max(0, element.scrollWidth * .425 - element.clientWidth / 2)))).toBeLessThan(1);
    const center = await viewport.evaluate((element) => {
      const initial = element.scrollLeft;
      element.scrollLeft = initial + 30;
      return initial;
    });
    await page.waitForTimeout(150);
    expect(await viewport.evaluate((element) => element.scrollLeft)).toBeCloseTo(center + 30, 0);
  }
});

test("phone swipes drive the film and the final icons remain usable", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator(".mw-hall-canvas.is-painted")).toBeVisible();
    const touch = await context.newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 550 }] });
    for (let step = 1; step <= 20; step++) {
      await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: 550 - step * 14 }] });
      await page.waitForTimeout(20);
    }
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => page.locator(".mw-hall-caption").evaluate((element) => Number(getComputedStyle(element).opacity))).toBeLessThan(.8);
    await page.getByRole("button", { name: "进入大厅" }).click();
    await hall(page);
    await page.waitForTimeout(700);
    const hits = await page.locator("[data-portal]").evaluateAll((elements) => elements.every((element) => {
      const box = element.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("[data-portal]") === element;
    }));
    expect(hits).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && scrollY === 0)).toBe(true);
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

test("reduced motion and a missing frame renderer both keep navigation available", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await hall(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/music-world-continuous/timeline.json", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".mw-interactive-hall.uses-video")).toBeVisible();
  await page.mouse.move(800, 450);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => page.locator(".mw-hall-film").evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(.05);
  await page.getByRole("button", { name: "进入大厅" }).click();
  await hall(page);
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
  await page.locator('[data-portal="demo"]').click();
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
