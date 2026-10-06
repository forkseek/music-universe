import { expect, test } from "@playwright/test";
import type { MusicWorld } from "../../src/types/world";

const headers = { "X-Music-World": "1" };
test.setTimeout(90_000);

test("document headers permit the app and block a script without a nonce", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/#hall");
  await expect(page.locator(".mw-hall-ready")).toBeVisible();
  const result = response!.headers();
  expect(result["x-content-type-options"]).toBe("nosniff");
  expect(result["x-frame-options"]).toBe("DENY");
  expect(result["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(result["permissions-policy"]).toContain("microphone=()");
  expect(result["x-powered-by"]).toBeUndefined();
  const policy = result["content-security-policy"];
  const nonce = policy.match(/'nonce-([^']+)'/u)![1];
  expect(nonce.length).toBeGreaterThanOrEqual(24);
  expect(policy).toContain("'strict-dynamic'");
  expect(policy.split(";").find((part) => part.includes("script-src"))).not.toContain("'unsafe-inline'");
  expect(await page.locator("script").evaluateAll((elements) => elements.filter((element) => !element.hasAttribute("src") && element.textContent).every((element) => Boolean(element.nonce)))).toBe(true);
  expect(await page.locator("script[src]").evaluateAll((elements) => elements.some((element) => Boolean(element.nonce)))).toBe(true);
  const second = await page.request.get("/");
  expect(second.headers()["content-security-policy"].match(/'nonce-([^']+)'/u)![1]).not.toBe(nonce);
  await page.context().grantPermissions(["local-network-access"], { origin: new URL(page.url()).origin });
  await page.addInitScript(() => {
    Reflect.set(window, "__blockedDirectives", []);
    document.addEventListener("securitypolicyviolation", (event) => {
      Reflect.get(window, "__blockedDirectives").push(event.effectiveDirective);
    });
  });
  // Inject into the HTTP document: scripts made by a trusted runtime may inherit
  // strict-dynamic trust, so a parser-inserted payload exercises the XSS boundary.
  await page.route("**/*csp-probe=1*", async (route) => {
    const upstream = await route.fetch();
    const body = (await upstream.text()).replace("</body>",
      "<script>document.documentElement.dataset.unauthorizedScript = 'ran'</script></body>");
    await route.fulfill({ response: upstream, body });
  });
  await page.goto("/?csp-probe=1#hall");
  await expect(page.locator(".mw-hall-ready")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.unauthorizedScript)).toBeUndefined();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "__blockedDirectives").includes("script-src-elem"))).toBe(true);
  await page.locator('[data-portal="import"]').click();
  await expect(page).toHaveURL(/#import$/u);
  await expect(page.locator(".mw-fog-transition")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByLabel("选择歌单文件")).toBeVisible();
  expect(errors).toEqual([]);
});

test("API validates JSON, cookie flags, upload sizes and broken files", async ({ request }) => {
  const initial = await request.get("/api/library");
  expect(initial.headers()["cache-control"]).toContain("no-store");
  expect(initial.headers()["set-cookie"]).toMatch(/HttpOnly/iu);
  expect(initial.headers()["set-cookie"]).toMatch(/SameSite=Lax/iu);
  expect((await request.post("/api/imports/demo")).status()).toBe(403);
  expect((await request.delete("/api/library", { headers: { ...headers, Origin: "https://unrelated.invalid" } })).status()).toBe(403);
  expect((await request.post("/api/worlds", { headers, data: { name: "Empty" } })).status()).toBe(422);
  expect((await request.post("/api/worlds", { headers, data: "{" })).status()).toBe(400);
  expect((await request.post("/api/music/normalize", { headers, data: "x".repeat(2 * 1024 * 1024 + 1) })).status()).toBe(413);
  const normalized = await request.post("/api/music/normalize", { headers, data: [{ title: "Valid", artist: "Artist" }] });
  expect((await normalized.json()).stats.uniqueTracks).toBe(1);
  expect((await (await request.get("/api/library")).json()).counts.tracks).toBe(0);
  const oversized = await request.post("/api/imports/file", { headers, multipart: { files: { name: "large.txt", mimeType: "text/plain", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) } } });
  expect(oversized.status()).toBe(413);
  const bad = await request.post("/api/imports/file", { headers, multipart: { files: { name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{") } } });
  expect(bad.ok()).toBe(true);
  const report = (await bad.json()).report;
  expect(report.tracks).toEqual([]);
  expect(report.errors[0].message).toContain("JSON");
  const library = await (await request.get("/api/library")).json();
  expect(library.counts.tracks).toBe(0);
  expect(library.imports[0].status).toBe("failed");
});

test("separate sessions cannot read or modify each other's worlds and journeys", async ({ request, playwright, baseURL }) => {
  const outsider = await playwright.request.newContext({ baseURL });
  try {
    await request.get("/api/library");
    await outsider.get("/api/library");
    expect((await request.post("/api/imports/demo", { headers })).ok()).toBe(true);
    const created = await request.post("/api/worlds", { headers, data: { name: "Ownership check", scope: "demo" } });
    expect(created.ok()).toBe(true);
    const world = (await created.json()).world as MusicWorld;
    const route = await request.post("/api/journeys", { headers, data: { worldId: world.id, startNodeId: world.nodes[0].id } });
    expect(route.ok()).toBe(true);
    const journey = await route.json();
    expect((await outsider.get("/api/worlds/" + world.id)).status()).toBe(404);
    expect((await outsider.get("/api/journeys/" + journey.id)).status()).toBe(404);
    expect((await outsider.post("/api/journeys", { headers, data: { worldId: world.id, startNodeId: world.nodes[0].id } })).status()).toBe(404);
    expect((await outsider.post("/api/guide", { headers, data: { worldId: world.id, nodeId: world.nodes[0].id, question: "为什么相连？" } })).status()).toBe(404);
    expect((await request.post("/api/imports/demo", { headers: { ...headers, "Sec-Fetch-Site": "cross-site" } })).status()).toBe(403);
    expect((await request.post("/api/imports/demo", { headers: { ...headers, Origin: "https://unrelated.invalid" } })).status()).toBe(403);
    expect((await request.post("/api/worlds", { headers, data: { name: "Injected", userId: "other-user" } })).status()).toBe(400);
    await outsider.delete("/api/library", { headers });
    expect((await request.get("/api/worlds/" + world.id)).ok()).toBe(true);
    expect((await request.get("/api/journeys/" + journey.id)).ok()).toBe(true);
  } finally { await outsider.dispose(); }
});

test("uploaded markup renders as text and unsafe links or credential fields are discarded", async ({ page }) => {
  const name = "<svg onload=alert(1)>Music</svg>";
  const title = "<img src=x onerror=alert(1)>";
  await page.request.get("/api/library");
  const rows = [{ title, artist: "Test Artist", cookie: "test-secret", playbackUrl: "https://audio.invalid/song.mp3", externalUrl: "javascript:alert(1)" },
    ...Array.from({ length: 5 }, (_, index) => ({ title: "Safe Song " + index, artist: "Test Artist", album: "Album", genre: "rock" }))];
  const imported = await page.request.post("/api/imports/file", { headers, multipart: { files: { name: "input-check.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(rows)) } } });
  expect(imported.ok()).toBe(true);
  const library = await (await page.request.get("/api/library")).json();
  const serialized = JSON.stringify(library);
  expect(serialized).not.toContain("test-secret");
  expect(serialized).not.toContain("audio.invalid");
  expect(serialized).not.toContain("javascript:");
  const created = await page.request.post("/api/worlds", { headers, data: { name } });
  const world = (await created.json()).world as MusicWorld;
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.goto("/world/" + world.id);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.locator("img[onerror], svg[onload]")).toHaveCount(0);
  await expect(page.locator(".react-flow__node").filter({ hasText: title })).toHaveCount(1);
  expect(dialogs).toEqual([]);
});
