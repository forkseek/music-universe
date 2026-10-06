import Database from "better-sqlite3";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Uses a fresh probe file beside the target database, never modifies user tables.
const configured = process.env.DATABASE_PATH ?? process.env.DATABASE_URL?.replace(/^file:/u, "") ?? "./data/music-world.db";
if (configured === ":memory:" || /^(https?|libsql):/u.test(configured)) throw new Error("配置必须指向持久化 SQLite 文件。");
const parent = path.dirname(path.resolve(configured));
mkdirSync(parent, { recursive: true });
const probeDir = mkdtempSync(path.join(parent, ".music-world-probe-"));
let db;
try {
  const file = path.join(probeDir, "probe.db");
  db = new Database(file);
  assert.equal(db.pragma("journal_mode = WAL", { simple: true }), "wal");
  db.exec("CREATE TABLE probe (value TEXT NOT NULL)");
  const value = randomUUID();
  db.prepare("INSERT INTO probe VALUES (?)").run(value);
  db.close();
  db = new Database(file, { readonly: true });
  assert.equal(db.prepare("SELECT value FROM probe").get().value, value);
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  console.log(JSON.stringify({ writable: true, wal: true, reopened: true, integrity: "ok", note: "本次验证目录写入与重新打开；跨容器重建保留仍需持久卷及目标环境实测。" }));
} finally {
  if (db?.open) db.close();
  const resolved = path.resolve(probeDir);
  if (path.dirname(resolved) === parent && path.basename(resolved).startsWith(".music-world-probe-")) rmSync(resolved, { recursive: true, force: true });
}
