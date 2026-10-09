import { chromium, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

export async function verifyDeploymentBrowser(origin, { automaticNext: runAutomaticNext = true } = {}) {
  const browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], failedResources = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    const url = new URL(response.url());
    if (url.origin === origin && response.status() >= 400) failedResources.push({ path: url.pathname, status: response.status() });
  });
  try {
    // Assert scene, overlays and fonts below; do not gate entry on every page resource's load event.
    await page.goto(origin + "/#hall", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByTestId("hall-universe-entry").click();
    await expect(page).toHaveURL(origin + "/#universe");
    const room = page.frameLocator('iframe[title="专辑宇宙 3D 场景"]');
    await expect(room.locator(".galaxy-viewport canvas").first()).toBeVisible({ timeout: 45000 });
    await expect(room.locator(".scene-loading")).toHaveCount(0, { timeout: 45000 });
    await expect(page.getByTestId("album-universe-room")).toHaveClass(/is-ready/, { timeout: 45000 });
    await expect(page.locator(".mw-universe-loading")).toBeHidden({ timeout: 45000 });
    await expect(page.locator(".mw-fog-transition")).toHaveCount(0, { timeout: 15000 });
    await room.locator("body").evaluate(() => document.fonts.ready);
    const closeGuide = room.getByRole("button", { name: "关闭使用指南" });
    if (await closeGuide.isVisible()) await closeGuide.click();
    await expect(room.locator(".guide-dialog")).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(failedResources).toEqual([]);
    mkdirSync("test-results", { recursive: true });
    await page.screenshot({ path: "test-results/render-universe.png" });
    writeFileSync("test-results/render-browser-proof.json", JSON.stringify({ hallPortal: true, sameOriginUniverse: true, loadingOverlayDismissed: true, webgl: true, fontsLoaded: true, errors, failedResources }, null, 2));
    console.log("Production hall → same-origin 3D universe verified.");
  } finally { await browser.close(); }

  if (!runAutomaticNext) return;

  // Fixtures supply API data and generated tones; the production frontend uses native audio/WebGL.
  const automaticNext = spawn(process.execPath, ["tests/automatic-next.mjs"], {
    cwd: path.join(process.cwd(), "apps/music-universe"), windowsHide: true, stdio: "inherit",
    env: { ...process.env, UNIVERSE_TEST_URL: origin + "/universe/index.html" },
  });
  await new Promise((resolve, reject) => {
    automaticNext.once("error", reject);
    automaticNext.once("exit", code => code === 0 ? resolve() : reject(new Error("Production automatic-next browser verification failed.")));
  });
}
