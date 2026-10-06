import { getProvider } from "@/lib/music/providers/registry";
import { normalizeTrack } from "@/lib/music/normalize/track";
import { deduplicateTracks } from "@/lib/music/normalize/deduplicate";
import { IMPORT_LIMITS as L } from "./limits";
import type { ImportFile, ImportReport } from "./types";
import type { FileSourceProviderId } from "@/types/music";

export function importPlaylistFiles(files: readonly ImportFile[], options: { demo?: boolean; declaredSource?: FileSourceProviderId } = {}): ImportReport {
  const empty: ImportReport = { isDemo: options.demo === true, tracks: [], stats: { totalRecords: 0, validRecords: 0, invalidRecords: 0, mergedRecords: 0, uniqueTracks: 0 }, files: [], errors: [], warnings: [] };
  if (!files.length || files.length > L.maxFiles || files.reduce((sum, file) => sum + file.bytes.byteLength, 0) > L.maxBatchBytes) {
    empty.errors.push({ fileName: "批次", code: "INVALID_BATCH", message: "每次请选择 1–10 个文件，总大小最多 10 MiB。" });
    return empty;
  }
  // Different content with the same basename makes file+row provenance ambiguous.
  if (new Set(files.map((file) => file.name)).size !== files.length) {
    empty.errors.push({ fileName: "批次", code: "DUPLICATE_FILE_NAME", message: "本批次含同名文件，请重命名后再导入，以便准确保留来源。" });
    return empty;
  }
  const provider = getProvider("file");
  const parsed = files.map((file) => provider.parseFile!(file, options.declaredSource));
  const totalRecords = parsed.reduce((sum, file) => sum + file.totalRecords, 0);
  const filesInfo = parsed.map((file) => ({ fileName: file.fileName, encoding: file.encoding, totalRecords: file.totalRecords, errors: file.errors, warnings: file.warnings }));
  if (totalRecords > L.maxTracks) {
    return { ...empty, files: filesInfo, stats: { ...empty.stats, totalRecords, invalidRecords: totalRecords }, errors: [
      { fileName: "批次", code: "TOO_MANY_TRACKS", message: `每批最多 ${L.maxTracks} 条歌曲；本批次未导入，请拆分。` },
      ...parsed.flatMap((file) => file.errors),
    ] };
  }
  const normalized = parsed.flatMap((file) => file.tracks.map((track) => normalizeTrack(options.demo ? {
    ...track, source: { ...track.source, provider: "demo", importedVia: "demo" },
  } : track)));
  const result = deduplicateTracks(normalized);
  return {
    isDemo: options.demo === true,
    tracks: result.tracks,
    stats: { totalRecords, validRecords: normalized.length, invalidRecords: totalRecords - normalized.length,
      mergedRecords: result.mergedRecords, uniqueTracks: result.tracks.length },
    files: filesInfo, errors: parsed.flatMap((file) => file.errors), warnings: parsed.flatMap((file) => file.warnings),
  };
}
