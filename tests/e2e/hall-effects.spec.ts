import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(90_000);

test("the 2K plate loads at arrival, dissolves in, and animates the robot locally", async ({ page }) => {
  const errors: string[] = [];
  const requested: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requested.push(request.url()));
  await page.goto("/");
  await expect(page.locator(".mw-hall-canvas.is-painted")).toBeVisible();
  expect(requested.some((url) => url.includes("scene-hall-2k.webp"))).toBe(false);
  await page.getByRole("button", { name: "进入大厅" }).click();
  const scene = page.locator(".mw-hall-living.is-loaded");
  await expect(scene).toHaveAttribute("data-scene-resolution", "2688x1536");
  await expect(scene).toHaveAttribute("data-motion-mode", "moving");
  await expect.poll(() => scene.evaluate((element) => Number(getComputedStyle(element).opacity))).toBe(1);
  const dimensions = await page.evaluate(() => new Promise<number[]>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
    image.onerror = reject;
    image.src = "/media/scene-hall-2k.webp";
  }));
  expect(dimensions).toEqual([2688, 1536]);
  const surface = page.locator(".mw-living-canvas");
  const first = await surface.screenshot();
  await page.waitForTimeout(1250);
  expect((await surface.screenshot()).equals(first)).toBe(false);
  await expect(page.locator(".mw-breathing-light")).toHaveCount(20);
  const motion = await page.locator(".mw-robot-lamp").evaluate((element) => getComputedStyle(element).animationDuration);
  expect(motion).toBe("5.6s");
  expect(errors).toEqual([]);
});

test("every icon describes its module in a hoverable cloud and Escape dismisses it", async ({ page }) => {
  await page.goto("/#hall");
  await expect(page.locator(".mw-hall-ready")).toBeVisible();
  for (const id of ["world", "library", "import", "demo", "journey", "guide", "qq"]) {
    const target = page.locator('[data-portal="' + id + '"]');
    await target.hover();
    const hint = page.getByRole("tooltip");
    await expect(hint).toBeVisible();
    await expect(hint).toHaveAttribute("data-for-portal", id);
    await expect(target).toHaveAttribute("aria-describedby", "mw-hall-tooltip");
    expect((await hint.locator("p").innerText()).length).toBeGreaterThan(20);
    await hint.hover();
    await page.waitForTimeout(400);
    await expect(hint).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(hint).toHaveCount(0);
  }
  await page.locator('[data-portal="import"]').focus();
  await expect(page.getByRole("tooltip")).toHaveAttribute("data-for-portal", "import");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#import$/u);
  await expect(page.locator(".mw-fog-transition")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByLabel("选择歌单文件")).toBeVisible();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("clouds stay inside portrait and small landscape viewports", async ({ page }) => {
  await page.goto("/#hall");
  await expect(page.locator(".mw-hall-ready")).toBeVisible();
  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 667, height: 375 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(size);
    for (const id of ["world", "library", "import", "demo", "journey", "guide", "qq"]) {
      await page.locator('[data-portal="' + id + '"]').focus();
      const hint = page.getByRole("tooltip");
      await expect(hint).toBeVisible();
      await page.waitForTimeout(420);
      const bounds = await hint.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width + 1);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
      await page.keyboard.press("Escape");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("the 2K still and navigation survive an unavailable WebGL renderer", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { value: function (this: HTMLCanvasElement, type: string, ...options: unknown[]) {
      if (type === "webgl" || type === "webgl2") return null;
      return Reflect.apply(original, this, [type, ...options]);
    } });
  });
  await page.goto("/#hall");
  await expect(page.locator(".mw-hall-living.is-loaded")).toHaveAttribute("data-motion-mode", "still");
  await expect(page.locator(".mw-living-still")).toHaveCSS("background-image", /scene-hall-2k.webp/u);
  await page.locator('[data-portal="library"]').click();
  await expect(page).toHaveURL(/#library$/u);
  await expect(page.locator(".mw-fog-transition")).toHaveCount(0, { timeout: 20_000 });
  await page.getByRole("button", { name: "回到音乐大厅" }).click();
  await expect(page.locator(".mw-hall-living.is-loaded")).toHaveAttribute("data-motion-mode", "still");
});

test("reduced motion keeps the high resolution scene stable and keyboard navigation usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".mw-hall-living.is-loaded")).toBeVisible();
  const surface = page.locator(".mw-living-canvas");
  await page.waitForTimeout(500);
  const first = await surface.screenshot();
  await page.waitForTimeout(600);
  expect((await surface.screenshot()).equals(first)).toBe(true);
  await expect(page.locator(".mw-robot-lamp")).toHaveCSS("animation-name", "none");
  await page.locator('[data-portal="demo"]').focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await expect(page.getByRole("tooltip")).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#demo$/u);
});
