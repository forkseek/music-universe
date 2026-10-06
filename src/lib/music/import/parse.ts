import { parse } from "csv-parse/browser/esm/sync";
import { IMPORT_LIMITS as L } from "./limits";
import { decodeFile } from "./encoding";
import { validateRow } from "./validate";
import type { ImportFile, ParsedFile } from "./types";
import type { FileSourceProviderId } from "@/types/music";

export function parsePlaylistFile(file: ImportFile, declaredSource: FileSourceProviderId = "file"): ParsedFile {
  const output: ParsedFile = { fileName: file.name, totalRecords: 0, tracks: [], errors: [], warnings: [] };
  const fail = (code: string, message: string, row?: number) => {
    output.errors.push({ fileName: file.name, code, message, row });
    return output;
  };
  if (file.name.length > L.maxFieldLength) return fail("FILE_NAME_TOO_LONG", "文件名最多 500 个字符。");
  if (file.bytes.byteLength > L.maxFileBytes) return fail("FILE_TOO_LARGE", "单个文件最多 2 MiB，请拆分歌单。");
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (!["csv", "json", "txt"].includes(extension ?? "")) return fail("UNSUPPORTED_FORMAT", "只支持 .csv、.json、.txt 文件。");
  let content: string;
  try {
    const decoded = decodeFile(file.bytes, file.encoding);
    content = decoded.text;
    output.encoding = decoded.encoding;
  } catch (error) {
    return fail("INVALID_ENCODING", (error as Error).message);
  }
  if (!content.trim()) return fail("EMPTY_FILE", "文件为空，请添加至少一首歌曲。");
  const candidates: { value: unknown; row: number; error?: string }[] = [];
  if (extension === "json") {
    let value: unknown;
    try { value = JSON.parse(content); } catch {
      return fail("INVALID_JSON", "JSON 格式损坏，请检查引号、逗号和括号；需要歌曲对象数组。");
    }
    if (!Array.isArray(value)) return fail("INVALID_JSON_ROOT", "JSON 顶层必须是歌曲数组，例如 [{\"title\":\"Let Down\",\"artist\":\"Radiohead\"}]。");
    output.totalRecords = value.length;
    if (value.length > L.maxTracks) return fail("TOO_MANY_TRACKS", `单个文件最多 ${L.maxTracks} 条歌曲，本文件未导入。`);
    value.forEach((item, index) => candidates.push({ value: item, row: index + 1 }));
  } else if (extension === "csv") {
    let records: { record: string[]; info: { lines: number } }[];
    try {
      // csv-parse's no-columns overload omits the info:true wrapper in its types.
      records = parse(content.replace(/\r\n?/gu, "\n"), {
        bom: true, info: true, skip_empty_lines: true, trim: true,
        relax_column_count: true, max_record_size: L.maxFileBytes,
      }) as unknown as typeof records;
    } catch (error) {
      const csvError = error as { lines?: number };
      return fail("INVALID_CSV", "CSV 格式损坏：检查未闭合引号；字段中的逗号需用双引号包围，内部双引号写成两个双引号。", csvError.lines);
    }
    const header = records.shift()?.record.map((name) => name.trim());
    if (!header || !header.includes("title") || !header.includes("artist")) return fail("MISSING_COLUMNS", "CSV 首行必须包含 title 和 artist 列（英文小写）。");
    if (new Set(header).size !== header.length || header.some((name) => !name || name.length > L.maxFieldLength)) return fail("INVALID_HEADER", "CSV 列名不能为空、重复或超过 500 个字符。");
    output.totalRecords = records.length;
    if (records.length > L.maxTracks) return fail("TOO_MANY_TRACKS", `单个文件最多 ${L.maxTracks} 条歌曲，本文件未导入。`);
    for (const item of records) {
      candidates.push({ value: Object.fromEntries(header.map((key, index) => [key, item.record[index]])), row: item.info.lines,
        error: item.record.length !== header.length ? `此行有 ${item.record.length} 列，表头有 ${header.length} 列；检查逗号和引号。` : undefined });
    }
  } else {
    content.split(/\r\n|\n|\r/u).forEach((line, index) => {
      if (!line.trim()) return;
      // The separator is exactly one ASCII hyphen surrounded by whitespace.
      const parts = line.split(/\s+-\s+/u);
      candidates.push({ value: { artist: parts[0]?.trim(), title: parts[1]?.trim() }, row: index + 1,
        error: parts.length !== 2 ? "TXT 每行必须为“艺术家 - 歌名”；分隔符两侧需有空格。多个分隔符有歧义，请改用 CSV 或 JSON。" : undefined });
    });
    output.totalRecords = candidates.length;
    if (candidates.length > L.maxTracks) return fail("TOO_MANY_TRACKS", `单个文件最多 ${L.maxTracks} 条歌曲，本文件未导入。`);
  }
  if (!output.totalRecords) return fail("EMPTY_FILE", "没有歌曲记录，请在表头或数组中添加歌曲。");
  for (const item of candidates) {
    if (item.error) {
      output.errors.push({ fileName: file.name, row: item.row, code: extension === "txt" ? "AMBIGUOUS_TXT" : "COLUMN_COUNT", message: item.error });
      continue;
    }
    const checked = validateRow(item.value, file.name, item.row, declaredSource);
    if (checked.track?.source.provider === "demo") {
      output.errors.push({ fileName: file.name, row: item.row, code: "INVALID_PROVIDER", message: "上传文件不能声明为内置 Demo 来源。" });
      continue;
    }
    if (checked.track) output.tracks.push(checked.track);
    output.errors.push(...checked.errors);
    output.warnings.push(...checked.warnings);
  }
  return output;
}
