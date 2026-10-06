import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";

const root = process.cwd();
const standalone = path.join(root, ".next/standalone");
assert.ok(existsSync(path.join(standalone, "server.js")), "先运行 npm run build。");
const temporary = mkdtempSync(path.join(tmpdir(), "music-world-restart-"));
const deployment = path.join(temporary, "app");
const database = path.join(temporary, "volume/music-world.db");
let child;
try {
  cpSync(standalone, deployment, { recursive: true });
  cpSync(path.join(root, "public"), path.join(deployment, "public"), { recursive: true });
  cpSync(path.join(root, ".next/static"), path.join(deployment, ".next/static"), { recursive: true });
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  async function start(configureOrigin = true) {
    child = spawn(process.execPath, [path.join(deployment, "server.js")], {
      cwd: deployment, windowsHide: true, stdio: "pipe",
      env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", DATABASE_PATH: database,
        APP_ORIGIN: configureOrigin ? origin : "", NEXT_TELEMETRY_DISABLED: "1", AI_PROVIDER: "none", AI_API_KEY: "" },
    });
    // Consume output without writing headers, cookies or runtime configuration to logs.
    child.stdout.resume(); child.stderr.resume();
    let spawnError;
    child.on("error", (error) => { spawnError = error; });
    for (let attempt = 0; attempt < 120; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`独立服务提前退出，exit=${child.exitCode}。`);
      try { const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1500) }); if (response.ok) return; } catch { /* startup */ }
      await delay(250);
    }
    throw new Error("独立服务在 30 秒内未就绪。");
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, "exit");
    child.kill(); await exited; child = undefined;
  }
  let cookie;
  async function api(route, options = {}) {
    const response = await fetch(`${origin}${route}`, { ...options, signal: AbortSignal.timeout(10000), headers: { "X-Music-World": "1", Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
    if (!cookie) cookie = response.headers.get("set-cookie")?.split(";")[0];
    assert.equal(response.status, 200, `${route} 返回 ${response.status}`);
    return response.json();
  }
  await start();
  await api("/api/library");
  assert.ok(cookie);
  const form = new FormData();
  for (const name of ["playlist.csv", "playlist.json", "playlist.txt"]) form.append("files", new Blob([readFileSync(path.join(root, "public/samples", name))]), name);
  const imported = await api("/api/imports/file", { method: "POST", body: form });
  assert.equal(imported.addedTracks, 3); assert.equal(imported.addedSources, 9);
  await api("/api/imports/demo", { method: "POST" });
  const create = (name, scope) => api("/api/worlds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, scope }) });
  const real = (await create("Restart Proof", "library")).world;
  const demo = (await create("Demo Restart Proof", "demo")).world;
  const journey = await api("/api/journeys", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ worldId: demo.id, startNodeId: demo.nodes[0].id, length: 5, intent: "更梦幻一点" }) });
  assert.equal(journey.nodes.length, 5);
  assert.equal(journey.intent, "更梦幻一点"); assert.equal(journey.mode, "deterministic");
  const before = await api("/api/library");
  await stop();
  // A new operating-system process reads the same mounted-disk path and cookie.
  await start(false);
  assert.deepEqual(await api("/api/library"), before);
  assert.deepEqual(await api(`/api/worlds/${real.id}`), real);
  assert.deepEqual(await api(`/api/worlds/${demo.id}`), demo);
  assert.deepEqual(await api(`/api/journeys/${journey.id}`), journey);
  assert.equal((await api("/api/imports/demo", { method: "POST" })).reused, true);
  assert.equal((await api("/api/library?scope=demo")).counts.tracks, 60);
  assert.equal((await create("Restart Proof", "library")).world.id, real.id);
  const rejected = await fetch(`${origin}/api/worlds`, { method: "POST", headers: { "X-Music-World": "1", Origin: "https://unrelated.invalid", Cookie: cookie,
    "Content-Type": "application/json" }, body: JSON.stringify({ name: "Rejected", scope: "library" }) });
  assert.equal(rejected.status, 403);
  assert.equal((await fetch(`${origin}/samples/playlist.csv`)).status, 200);
  await stop();
  const db = new Database(database, { readonly: true });
  try {
    assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally { db.close(); }
  const proof = { checkedAt: new Date().toISOString(), standaloneInIsolatedFolder: true, distinctProcessRestart: true, libraryTracks: 3, librarySources: 9,
    demoTracks: 60, demoNodes: demo.nodes.length, demoEdges: demo.edges.length, journeyStops: journey.nodes.length,
    journeyIntent: journey.intent, journeyMode: journey.mode, exactLibraryWorldAndJourneyMatch: true, repeatedImportReused: true,
    localHostOriginAcceptedWithoutConfiguration: true, foreignOriginRejected: true,
    sqliteIntegrity: "ok", foreignKeyViolations: 0 };
  mkdirSync(path.join(root, "test-results"), { recursive: true });
  writeFileSync(path.join(root, "test-results/restart-proof.json"), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
} finally {
  if (child && child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
  const resolved = path.resolve(temporary);
  if (path.dirname(resolved) === path.resolve(tmpdir()) && path.basename(resolved).startsWith("music-world-restart-")) rmSync(resolved, { recursive: true, force: true });
}
