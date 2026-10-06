import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const standalone = path.join(root, ".next/standalone");
if (!existsSync(path.join(standalone, "server.js"))) throw new Error("请先运行 npm run build。");
cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
cpSync(path.join(root, ".next/static"), path.join(standalone, ".next/static"), { recursive: true });
const configured = process.env.DATABASE_PATH ?? process.env.DATABASE_URL?.replace(/^file:/u, "") ?? "./data/music-world.db";
if (configured === ":memory:" || /^(https?|libsql):/u.test(configured)) throw new Error("DATABASE_PATH 必须指向持久化 SQLite 文件。");
// Standalone changes cwd; resolve storage first to keep dev and start on the same disk.
process.env.DATABASE_PATH = path.resolve(root, configured);
process.env.HOSTNAME = process.env.HOSTNAME || "127.0.0.1";
await import(pathToFileURL(path.join(standalone, "server.js")).href);
