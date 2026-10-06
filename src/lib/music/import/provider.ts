import type { MusicProvider } from "../providers/types";
import type { ImportFile, ImportReport } from "./types";
import { normalizeTrack } from "../normalize/track";
import { deduplicateTracks } from "../normalize/deduplicate";

export async function importProviderLibrary(provider: MusicProvider): Promise<{ report: ImportReport; file: ImportFile }> {
  if (!await provider.isAvailable() || !provider.listPlaylists || !provider.getPlaylistTracks) throw new Error("Provider 尚未提供歌单导入能力。");
  const playlists = await provider.listPlaylists();
  const raw = (await Promise.all(playlists.map((playlist) => provider.getPlaylistTracks!(playlist.externalId)))).flat();
  if (raw.length > 5000) throw new Error("Provider 单次导入最多 5,000 首。");
  const file = { name: "demo-library.json", bytes: new TextEncoder().encode(JSON.stringify(raw)) };
  const normalized = raw.map(normalizeTrack);
  const deduplicated = deduplicateTracks(normalized);
  return { file, report: { isDemo: provider.id === "demo", tracks: deduplicated.tracks,
    stats: { totalRecords: raw.length, validRecords: raw.length, invalidRecords: 0, mergedRecords: deduplicated.mergedRecords, uniqueTracks: deduplicated.tracks.length },
    files: [{ fileName: file.name, totalRecords: raw.length, encoding: "utf-8", errors: [], warnings: [] }], errors: [], warnings: [] } };
}
