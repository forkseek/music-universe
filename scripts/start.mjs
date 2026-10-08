import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
process.env.MUSIC_INTEGRATION_ROOT ||= path.join(root, "integrations/mineradio");
const nextDist = process.env.NEXT_DIST_DIR || ".next";
const standalone = path.join(root, nextDist, "standalone");
if (!existsSync(path.join(standalone, "server.js"))) throw new Error("请先运行 npm run build。");
cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
cpSync(path.join(root, nextDist, "static"), path.join(standalone, nextDist, "static"), { recursive: true });
if (!process.env.DATABASE_URL) throw new Error('请先配置 Neon DATABASE_URL。');
if (!process.env.MUSIC_CREDENTIAL_SECRET || process.env.MUSIC_CREDENTIAL_SECRET.length < 32) throw new Error('请先配置固定的 MUSIC_CREDENTIAL_SECRET。');
process.env.MUSIC_MIGRATIONS_ROOT ||= path.join(root, 'src/db/postgres-migrations');
process.env.APP_ORIGIN ||= process.env.RENDER_EXTERNAL_URL || '';
process.env.HOSTNAME ||= '0.0.0.0';
process.env.MUSIC_DESKTOP_LOGIN = '0';
await import(pathToFileURL(path.join(standalone, "server.js")).href);
