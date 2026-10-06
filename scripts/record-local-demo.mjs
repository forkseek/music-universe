import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const baseURL = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3000";
const host = new URL(baseURL).hostname;
if (!["127.0.0.1", "localhost"].includes(host)) throw new Error("录制脚本只连接本机演示服务。");
const root = resolve(import.meta.dirname, "..");
const tempDir = resolve(root, "test-results/demo-video");
const output = resolve(root, "docs/artifacts/local-demo-draft.webm");
mkdirSync(tempDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 720 },
  recordVideo: { dir: tempDir, size: { width: 1280, height: 720 } } });
const page = await context.newPage();
const video = page.video();
const pause = (seconds) => page.waitForTimeout(seconds * 1000);
async function caption(text) {
  await page.evaluate((value) => {
    let box = document.getElementById("music-world-demo-caption");
    if (!box) {
      box = document.createElement("div");
      box.id = "music-world-demo-caption";
      Object.assign(box.style, { position: "fixed", left: "25px", bottom: "22px", zIndex: "99999", pointerEvents: "none",
        maxWidth: "720px", padding: "13px 18px", border: "1px solid #a9cd9c", borderRadius: "11px",
        background: "rgba(8, 21, 27, .94)", color: "#f4f8f0", font: "600 18px/1.5 Arial, Microsoft YaHei, sans-serif",
        boxShadow: "0 8px 30px #0008" });
      document.body.append(box);
    }
    box.textContent = `演示字幕 · ${value}`;
  }, text);
}

try {
  await page.goto("/");
  await expect(page.getByTestId("library-歌曲")).toHaveText("0");
  await caption("把散落歌单变成可探索的音乐世界");
  await pause(7);

  await page.getByRole("button", { name: "体验三种格式样例" }).click();
  await expect(page.getByTestId("stat-保留歌曲")).toHaveText("3");
  await page.locator(".results").scrollIntoViewIfNeeded();
  await caption("CSV、JSON、TXT：9 条输入合并为 3 首，保留 9 条来源");
  await pause(9);

  await page.getByRole("button", { name: "载入 60 首 Demo" }).click();
  await expect(page.getByTestId("library-歌曲")).toHaveText("60");
  await page.locator(".library-panel").scrollIntoViewIfNeeded();
  await caption("独立 Demo Music Library：60 首歌、20 位艺术家，不冒充个人播放记录");
  await pause(8);

  await page.getByLabel("世界名称").fill("Music World 演示");
  await page.getByRole("button", { name: "生成并保存音乐世界" }).click();
  await expect(page).toHaveURL(/\/world\/[\w-]+$/u);
  await expect(page.getByTestId("world-node-count")).toHaveText("30");
  await page.locator(".music-map").scrollIntoViewIfNeeded();
  await caption("60 首歌曲保存于库中；地图只显示 30 个主要节点和代表性连接");
  await pause(12);

  await page.getByLabel("快速定位节点").selectOption({ label: "流派 · alternative" });
  await expect(page.getByTestId("music-card")).toContainText("alternative");
  await caption("定位并点击节点：歌曲、艺术家、专辑和关系证据都来自导入信息");
  await pause(11);

  await page.getByLabel("问问这个节点").fill("为什么这些歌曲相连？");
  await page.getByRole("button", { name: "查看已有依据" }).click();
  await expect(page.locator(".guide-answer")).toBeVisible();
  await page.locator(".guide-answer").scrollIntoViewIfNeeded();
  await caption("Guide 当前是事实模式：解释有依据的关系，不猜测没有的数据");
  await pause(12);

  await page.getByLabel("探索方向（选填）").fill("更梦幻一点");
  await page.getByRole("button", { name: "从此节点生成 5 站 Journey" }).click();
  await expect(page.locator(".journey-stops li")).toHaveCount(5);
  await expect(page.locator(".journey-edge")).toHaveCount(4);
  await page.locator(".music-map").scrollIntoViewIfNeeded();
  await caption("输入“更梦幻一点”后生成五站真实歌曲路线；无模型时明确标为基础算法");
  await pause(16);

  await page.locator(".journey-stops").scrollIntoViewIfNeeded();
  await caption("每站可查看推荐理由；点击站点，地图会定位到对应歌曲");
  await pause(12);
  await page.locator(".journey-stops li").nth(2).getByRole("button").click();
  await page.locator(".music-map").scrollIntoViewIfNeeded();
  await caption("路线和节点在地图上亮起；歌曲始终来自这份音乐库");
  await pause(10);

  await page.getByRole("link", { name: "打开路线详情" }).click();
  await expect(page).toHaveURL(/\/journey\/[\w-]+$/u);
  await expect(page.locator(".journey-stops li")).toHaveCount(5);
  await page.reload();
  await expect(page.locator(".journey-stops li")).toHaveCount(5);
  await caption("Journey 与音乐世界已经保存；刷新后仍可继续探索");
  await pause(9);
} finally {
  try { await page.request.delete("/api/library", { headers: { "X-Music-World": "1" } }); } catch { /* Isolated recording session only. */ }
  await context.close();
  if (video) await video.saveAs(output);
  await browser.close();
}
console.log(`Saved silent captioned draft: ${output}`);
