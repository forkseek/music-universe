import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const project = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
const directRuntime = new Set(Object.keys(project.dependencies ?? {}));
const directDevelopment = new Set(Object.keys(project.devDependencies ?? {}));
const rows = Object.entries(lock.packages)
  .filter(([path]) => path.startsWith("node_modules/"))
  .map(([path, entry]) => {
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    const directPath = path === `node_modules/${name}`;
    const role = directPath && directRuntime.has(name) ? "direct runtime"
      : directPath && directDevelopment.has(name) ? "direct development" : "transitive or optional";
    return { name, version: entry.version ?? "unknown", license: entry.license ?? "UNKNOWN", path, role };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));

if (rows.some((row) => row.license === "UNKNOWN")) throw new Error("Lockfile contains dependencies without license metadata; review them before publishing the manifest.");
const csvCell = (value) => `"${String(value).replaceAll('"', '""')}"`;
const csv = ["package,version,license_expression,role,lockfile_path",
  ...rows.map((row) => [row.name, row.version, row.license, row.role, row.path].map(csvCell).join(","))].join("\n") + "\n";
writeFileSync(resolve(root, "docs/THIRD_PARTY_LICENSES.csv"), csv, "utf8");

const direct = rows.filter((row) => row.role.startsWith("direct "));
const md = [
  "# 第三方开源依赖记录",
  "",
  "依据当前 package-lock.json 生成。以下是项目直接声明的依赖及锁文件中的 SPDX 协议表达式；[完整锁文件清单](THIRD_PARTY_LICENSES.csv)包含直接、传递和可选依赖。清单表示解析出的依赖，不等同于特定操作系统的实际运行包，也不能代替逐个核对第三方素材和协议要求。",
  "",
  "| 包 | 版本 | 用途 | 协议表达式 |",
  "| --- | --- | --- | --- |",
  ...direct.map((row) => `| ${row.name} | ${row.version} | ${row.role === "direct runtime" ? "运行" : "开发"} | ${row.license} |`),
  "",
  `锁文件共列出 ${rows.length} 个依赖条目，其中直接依赖 ${direct.length} 个。应用内的唱片图形由 CSS 绘制；Demo 只保存歌曲元数据与可核对的页面链接，不复制歌词或音频。若之后加入外部图片、字体、代码或音频，应单独补充来源与许可记录。`,
  "",
  "赛事公开规则要求如实披露第三方开源框架、代码和对应协议；提交时以[官方规则](https://join.tencentmusic.com/ai-hackathon/)及登录后的实际表单为准。",
  "",
].join("\n");
writeFileSync(resolve(root, "docs/OPEN_SOURCE_NOTICE.md"), md, "utf8");
console.log(`Wrote ${rows.length} lockfile entries and ${direct.length} direct dependencies.`);
