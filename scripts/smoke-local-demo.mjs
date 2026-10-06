import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const origin = process.env.LOCAL_SMOKE_ORIGIN ?? "http://127.0.0.1:3000";
const health = await fetch(`${origin}/api/health`);
assert.equal(health.ok, true, "本机演示服务未就绪");
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
try {
  await page.goto(origin);
  await page.getByRole("link", { name: "Try Demo" }).click();
  await page.getByRole("button", { name: "载入 60 首 Demo" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="library-歌曲"]')?.textContent === "60");
  await page.getByRole("button", { name: "生成并保存音乐世界" }).click();
  await page.waitForURL(/\/world\/[\w-]+$/u);
  const worldUrl = page.url();
  await page.locator(".music-flow-node.is-active").waitFor();
  await page.getByRole("button", { name: "从此节点生成 5 站 Journey" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".journey-stops li").length === 5);
  await page.getByRole("link", { name: "打开路线详情" }).click();
  await page.waitForURL(/\/journey\/[\w-]+$/u);
  const journeyUrl = page.url();
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll(".journey-stops li").length === 5);
  await page.goto(origin);
  await page.getByRole("button", { name: "清空当前会话音乐库" }).click();
  await page.getByRole("button", { name: "确认清空我的数据" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="library-歌曲"]')?.textContent === "0");
  assert.equal((await context.request.get(worldUrl)).status(), 404);
  assert.equal((await context.request.get(journeyUrl)).status(), 404);
  const proof = { origin, health: "ok", demoTracks: 60, journeyStops: 5,
    journeySurvivedRefresh: true, ownWorldAndJourneyDeleted: true, isolatedBrowserContext: true };
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/d6-production-smoke.json", `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify(proof));
} finally {
  try { await context.request.delete(`${origin}/api/library`, { headers: { "X-Music-World": "1" } }); } catch { /* Best effort for this disposable session. */ }
  await browser.close();
}
