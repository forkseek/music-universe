import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(90_000);

test("the 2K room loads immediately and retains its decorative robot animation", async ({ page }) => {
  const errors: string[] = [];
  const requested: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requested.push(request.url()));
  await page.goto("/#hall");
  const scene = page.locator(".mw-hall-living.is-loaded");
  await expect(scene).toHaveAttribute("data-scene-resolution", "2688x1536");
  await expect(scene).toHaveAttribute("data-motion-mode", "moving");
  await expect.poll(() => scene.evaluate((element) => Number(getComputedStyle(element).opacity))).toBe(1);
  expect(requested.some((url) => url.includes("scene-hall-2k.webp"))).toBe(true);
  expect(requested.some((url) => url.includes("music-world-continuous"))).toBe(false);
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
  await expect(page.locator(".mw-breathing-light")).toHaveCount(14);
  await expect(page.locator(".mw-robot-lamp")).toHaveCSS("animation-duration", "5.6s");
  expect(errors).toEqual([]);
});

test("the only portal smoothly zooms on hover, resets on leave and follows its destination", async ({ page }) => {
  await page.goto("/#hall");
  const target = page.getByRole("link", { name: "进入专辑宇宙" });
  await expect(target).toBeVisible();
  const cover = target.locator("img");
  await expect.poll(() => cover.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(512);
  const coverBounds = await cover.boundingBox();
  const doorwayBounds = await target.boundingBox();
  expect(coverBounds!.width).toBeGreaterThan(doorwayBounds!.width);
  expect(coverBounds!.width).toBeLessThan(290);
  const hitArea = target.locator(".mw-universe-cover");
  const restingHitArea = await hitArea.boundingBox();
  const scale = () => cover.evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return Math.hypot(matrix.m11, matrix.m12, matrix.m13);
  });
  const restingTransform = await cover.evaluate((element) => getComputedStyle(element).transform);
  const ring = target.locator(".mw-hotspot-ring");
  const restingBorder = await ring.evaluate((element) => getComputedStyle(element).borderColor);
  await target.hover({ position: { x: 15, y: 15 } });
  await expect(ring).not.toHaveCSS("border-color", restingBorder);
  await expect(cover).not.toHaveCSS("transform", restingTransform);
  await expect.poll(scale).toBeGreaterThan(1.13);
  expect(await scale()).toBeLessThan(1.15);
  expect((await hitArea.boundingBox())!.width).toBeCloseTo(restingHitArea!.width, 1);
  await page.mouse.move(40, 40);
  await expect.poll(scale).toBeLessThan(1.005);
  await expect(cover).toHaveCSS("transform", restingTransform);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.locator('[data-portal]:not([data-portal="universe"])')).toHaveCount(0);
  await target.focus();
  await expect(target).toBeFocused();
  await expect(target).toHaveCSS("outline-style", "solid");
  const destination = (await target.getAttribute("href"))!;
  await page.route(destination, (route) => route.fulfill({ contentType: "text/html", body: "<title>Album universe destination fixture</title>" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(destination);
  await page.goBack();
  await expect(page.getByRole("link", { name: "进入专辑宇宙" })).toBeVisible();
});

test("the 2K still and single album doorway survive an unavailable WebGL renderer", async ({ page }) => {
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
  await expect(page.getByRole("link", { name: "进入专辑宇宙" })).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("reduced motion keeps the scene stable and album keyboard focus visible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".mw-hall-living.is-loaded")).toBeVisible();
  const surface = page.locator(".mw-living-canvas");
  await page.waitForTimeout(500);
  const first = await surface.screenshot();
  await page.waitForTimeout(600);
  expect((await surface.screenshot()).equals(first)).toBe(true);
  await expect(page.locator(".mw-robot-lamp")).toHaveCSS("animation-name", "none");
  const target = page.getByRole("link", { name: "进入专辑宇宙" });
  await target.focus();
  await expect(target).toBeFocused();
  await expect(target).toHaveCSS("outline-style", "solid");
  await expect(target.locator("img")).toHaveCSS("transform", "none");
});
