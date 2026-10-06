import { z } from "@/lib/validation";
import { normalizeTrack } from "../normalize/track";
import { deduplicateTracks } from "../normalize/deduplicate";
import { validateRow } from "../import/validate";
import { IMPORT_LIMITS } from "../import/limits";
import type { ImportFile, ImportReport } from "../import/types";

const id = z.string().regex(/^\d+$/u).max(20);
const song = z.object({ title: z.string().min(1).max(IMPORT_LIMITS.maxFieldLength),
  artists: z.array(z.string().min(1).max(IMPORT_LIMITS.maxFieldLength)).min(1).max(IMPORT_LIMITS.maxArtists),
  album: z.string().max(IMPORT_LIMITS.maxFieldLength).optional(),
  durationMs: z.number().int().positive().max(IMPORT_LIMITS.maxDurationMs).optional(),
  externalId: id, externalUrl: z.string().max(IMPORT_LIMITS.maxUrlLength).optional() }).strict();
const tracks = z.array(song).min(1).max(IMPORT_LIMITS.maxTracks);

/** The browser sends only metadata picked from the SDK response, never the raw response or credentials. */
export const qqMusicImportSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("playlist"), playlist: z.object({ externalId: id,
    name: z.string().min(1).max(IMPORT_LIMITS.maxFieldLength) }).strict(), tracks }).strict(),
  z.object({ kind: z.literal("recent"), tracks }).strict(),
]);
export type QQMusicImportPayload = z.infer<typeof qqMusicImportSchema>;

export function prepareQQMusicImport(payload: QQMusicImportPayload): { file: ImportFile; report: ImportReport } {
  const name = payload.kind === "playlist" ? `QQ 音乐歌单 · ${payload.playlist.name}` : "QQ 音乐最近播放";
  const parsed = payload.tracks.map((item, index) => validateRow({ ...item, provider: "qqmusic",
    playlistExternalId: payload.kind === "playlist" ? payload.playlist.externalId : undefined,
    playlistName: payload.kind === "playlist" ? payload.playlist.name : undefined,
    recentlyPlayed: payload.kind === "recent" ? true : undefined }, name, index + 1));
  const providerTracks = parsed.flatMap((item) => item.track ? [{ ...item.track, source: {
    ...item.track.source, importedVia: "official" as const, fileName: undefined,
  } }] : []);
  const result = deduplicateTracks(providerTracks.map(normalizeTrack));
  const errors = parsed.flatMap((item) => item.errors);
  const warnings = parsed.flatMap((item) => item.warnings);
  const report: ImportReport = { isDemo: false, tracks: result.tracks,
    stats: { totalRecords: payload.tracks.length, validRecords: providerTracks.length,
      invalidRecords: payload.tracks.length - providerTracks.length, mergedRecords: result.mergedRecords,
      uniqueTracks: result.tracks.length },
    files: [{ fileName: name, encoding: "utf-8", totalRecords: payload.tracks.length, errors, warnings }],
    errors, warnings };
  return { file: { name, bytes: new TextEncoder().encode(JSON.stringify(payload)) }, report };
}
