import { z } from "@/lib/validation";
import type { ProviderTrack } from "@/lib/music/providers/types";
import type { ImportIssue } from "./types";
import { IMPORT_LIMITS as L } from "./limits";
import { displayText, normalizeIsrc } from "@/lib/music/normalize/text";
import type { FileSourceProviderId } from "@/types/music";

const text = z.string().max(L.maxFieldLength, `字段最多 ${L.maxFieldLength} 个字符`).refine(
  (s) => displayText(s).length > 0 && displayText(s).length <= L.maxFieldLength && !/[\u0000-\u001f\ufffd]/u.test(s.replace(/[\r\n\t]/gu, "")),
  "字段不能为空或含无效字符",
);
const optionalText = z.preprocess((v) => v === "" ? undefined : v, text.optional());
const optionalBoolean = z.preprocess((v) => v === "" ? undefined : v === "true" ? true : v === "false" ? false : v, z.boolean().optional());
const duration = z.preprocess((v) => v === "" ? undefined : typeof v === "string" && /^\d+$/u.test(v) ? Number(v) : v,
  z.number().int().positive().max(L.maxDurationMs).optional());

const rowSchema = z.object({
  title: text,
  artist: optionalText,
  artists: z.array(text).min(1).max(L.maxArtists).optional(),
  album: optionalText,
  durationMs: duration,
  genre: z.union([text, z.array(text).max(L.maxGenres)]).optional(),
  releaseDate: optionalText,
  version: optionalText,
  isrc: optionalText,
  provider: z.enum(["qqmusic", "netease", "kugou", "qishui", "spotify", "file", "demo"]).default("file"),
  externalId: optionalText,
  externalUrl: z.string().max(L.maxUrlLength).optional(),
  playlistExternalId: optionalText,
  playlistName: optionalText,
  liked: optionalBoolean,
  recentlyPlayed: optionalBoolean,
}).refine((v) => v.artist || v.artists, { path: ["artist"], message: "需要 artist 或非空 artists 数组" });

/** Only known public song page paths; drop unknown/signed/query credentials. */
export function safeSongPage(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return;
    if (url.hostname === "music.163.com") {
      const query = url.hash.startsWith("#/song?") ? new URLSearchParams(url.hash.slice(7)) : url.pathname === "/song" ? url.searchParams : undefined;
      const id = query?.get("id");
      if (id && /^\d+$/u.test(id)) return `https://music.163.com/song?id=${id}`;
    }
    if (url.hostname === "y.qq.com" && /^\/n\/ryqq\/songDetail\/[A-Za-z0-9]+\/?$/u.test(url.pathname)) {
      return `https://y.qq.com${url.pathname}`;
    }
    if (url.hostname === "open.spotify.com" && /^\/track\/[A-Za-z0-9]{22}\/?$/u.test(url.pathname)) {
      return `https://open.spotify.com${url.pathname.replace(/\/$/u, "")}`;
    }
  } catch { /* Invalid URL is omitted and reported. */ }
}

export function validateRow(value: unknown, fileName: string, row: number, declaredSource: FileSourceProviderId = "file"): {
  track?: ProviderTrack; errors: ImportIssue[]; warnings: ImportIssue[];
} {
  // A selected source fills in missing provenance; an explicit row provider stays authoritative.
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? { provider: declaredSource, ...value } : value;
  const result = rowSchema.safeParse(input);
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  if (!result.success) {
    for (const issue of result.error.issues) errors.push({ fileName, row, code: "INVALID_FIELD", field: issue.path.join("."), message: `字段 ${issue.path.join(".") || "记录"} 无效：${issue.message}` });
    return { errors, warnings };
  }
  const data = result.data;
  const isrc = data.isrc ? normalizeIsrc(data.isrc) : undefined;
  if (data.isrc && !isrc) {
    return { errors: [{ fileName, row, code: "INVALID_ISRC", field: "isrc", message: "ISRC 应为 12 位字母数字（允许连字符），例如测试格式 ZZ-AAA-26-00001。" }], warnings };
  }
  const externalUrl = data.externalUrl ? safeSongPage(data.externalUrl) : undefined;
  if (data.externalUrl && !externalUrl) warnings.push({ fileName, row, code: "URL_OMITTED", message: "来源链接不是支持的 HTTPS 歌曲网页，已忽略。" });
  const artists = data.artists ?? [data.artist!];
  const genre = typeof data.genre === "string" ? [data.genre] : data.genre;
  // Explicit construction is the metadata whitelist. Unknown keys are never copied.
  const rawMetadata = {
    title: data.title, artists: [...artists], album: data.album,
    durationMs: data.durationMs, genre, releaseDate: data.releaseDate,
    isrc: data.isrc, version: data.version, liked: data.liked,
    recentlyPlayed: data.recentlyPlayed,
  };
  return {
    track: {
      title: data.title, artists, album: data.album, durationMs: data.durationMs,
      genre, releaseDate: data.releaseDate, isrc, version: data.version,
      rawMetadata,
      source: { provider: data.provider, importedVia: "file", externalId: data.externalId,
        externalUrl, playlistExternalId: data.playlistExternalId,
        playlistName: data.playlistName, fileName, row },
    }, errors, warnings,
  };
}
