import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDatabase, type DatabaseContext } from "@/db/connection";
import * as s from "@/db/schema";
import type { FileSourceProviderId, MusicProviderId, NormalizedTrack, TrackSource } from "@/types/music";
import type { LibraryScope } from "@/types/world";
import type { ImportFile, ImportReport } from "./import/types";
import { importPlaylistFiles } from "./import/library";
import { deduplicateTracks } from "./normalize/deduplicate";
import { matchText } from "./normalize/text";
import { deriveTrackSignal } from "./signals";
import { RequestError } from "@/lib/server/errors";

export function hash(value: string | Uint8Array) { return createHash("sha256").update(value).digest("hex"); }

export function readLibrary(userId: string, scope: LibraryScope = "library", context = getDatabase()) {
  const { db } = context;
  const rows = db.select().from(s.tracks).where(and(eq(s.tracks.userId, userId), eq(s.tracks.scope, scope))).orderBy(asc(s.tracks.createdAt), asc(s.tracks.id)).all();
  const ids = new Set(rows.map((t) => t.id));
  const artistRows = db.select().from(s.artists).where(eq(s.artists.userId, userId)).all();
  const albumRows = db.select().from(s.albums).where(eq(s.albums.userId, userId)).all();
  const credits = db.select().from(s.trackArtists).where(eq(s.trackArtists.userId, userId)).all().sort((a, b) => a.position - b.position);
  const origins = db.select().from(s.trackSources).where(eq(s.trackSources.userId, userId)).orderBy(asc(s.trackSources.id)).all();
  const sourceRows = db.select().from(s.musicSources).where(eq(s.musicSources.userId, userId)).all();
  const sourceMap = new Map(sourceRows.map((source) => [source.id, source.provider]));
  const artistMap = new Map(artistRows.map((artist) => [artist.id, artist]));
  const albumMap = new Map(albumRows.map((album) => [album.id, album]));
  const creditMap = new Map<string, { id: string; name: string }[]>();
  for (const credit of credits) { const artist = artistMap.get(credit.artistId)!; const list = creditMap.get(credit.trackId) ?? []; list.push({ id: artist.id, name: artist.name }); creditMap.set(credit.trackId, list); }
  const originMap = new Map<string, TrackSource[]>();
  for (const origin of origins) {
    const list = originMap.get(origin.trackId) ?? [];
    list.push({ id: origin.id, provider: sourceMap.get(origin.musicSourceId)!, importedVia: origin.importedVia,
      externalId: origin.externalId ?? undefined, externalUrl: origin.externalUrl ?? undefined, fileName: origin.fileName ?? undefined,
      row: origin.rowNumber ?? undefined, playlistExternalId: origin.playlistExternalId ?? undefined, playlistName: origin.playlistName ?? undefined, rawMetadata: origin.rawMetadata });
    originMap.set(origin.trackId, list);
  }
  const tracks: NormalizedTrack[] = rows.map((row) => ({ id: row.id, title: row.title, canonicalKey: row.canonicalKey, versionKey: row.versionKey,
    isrc: row.isrc ?? undefined, durationMs: row.durationMs ?? undefined, genre: row.genre ?? undefined, releaseDate: row.releaseDate ?? undefined,
    artists: creditMap.get(row.id) ?? [], album: row.albumId ? { id: row.albumId, name: albumMap.get(row.albumId)!.name } : undefined,
    sources: originMap.get(row.id) ?? [],
  }));
  const memberships = db.select().from(s.playlistTracks).where(eq(s.playlistTracks.userId, userId)).all().filter((item) => ids.has(item.trackId));
  const playlistRows = db.select().from(s.playlists).where(eq(s.playlists.userId, userId)).all();
  const playlists = playlistRows.map((playlist) => ({ id: playlist.id, name: playlist.name,
    trackIds: memberships.filter((member) => member.playlistId === playlist.id).sort((a, b) => a.position - b.position).map((member) => member.trackId),
  })).filter((playlist) => playlist.trackIds.length > 0);
  const worlds = db.select({ id: s.musicWorlds.id, name: s.musicWorlds.name, createdAt: s.musicWorlds.createdAt, totalTracks: s.musicWorlds.totalTracks }).from(s.musicWorlds).where(and(eq(s.musicWorlds.userId, userId), eq(s.musicWorlds.scope, scope))).orderBy(desc(s.musicWorlds.createdAt), desc(s.musicWorlds.id)).all();
  const imports = db.select({ id: s.importSessions.id, fileName: s.importSessions.fileName, status: s.importSessions.status, totalRecords: s.importSessions.totalRecords, validRecords: s.importSessions.validRecords, mergedRecords: s.importSessions.mergedRecords, createdAt: s.importSessions.createdAt }).from(s.importSessions).where(and(eq(s.importSessions.userId, userId), eq(s.importSessions.scope, scope))).orderBy(desc(s.importSessions.createdAt), desc(s.importSessions.id)).all();
  return { scope, tracks, playlists, signals: tracks.map(deriveTrackSignal), worlds, imports,
    counts: { tracks: tracks.length, artists: new Set(tracks.flatMap((track) => track.artists.map((artist) => artist.id))).size,
      albums: new Set(tracks.map((track) => track.album?.id).filter(Boolean)).size, sources: tracks.reduce((sum, track) => sum + track.sources.length, 0), playlists: playlists.length } };
}
export type Library = ReturnType<typeof readLibrary>;

export interface SavedImport { importId: string; reused: boolean; addedTracks: number; addedSources: number; report: ImportReport }

function sourceFingerprint(source: TrackSource, scope: LibraryScope, fileHash?: string): string {
  // Official playlist and recent-play entries are identified by provider IDs, not mutable display metadata.
  if (source.importedVia === "official" && source.externalId) return hash(JSON.stringify([
    scope, source.provider, source.importedVia, source.externalId, source.playlistExternalId ?? null,
  ]));
  // Ignore renamed filenames; file content, occurrence and explicit metadata define identity.
  return hash(JSON.stringify([scope, source.provider, source.importedVia, source.externalId ?? null,
    source.playlistExternalId ?? null, fileHash ?? source.fileName ?? null, source.row ?? null,
    Object.entries(source.rawMetadata).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))]));
}

export function saveFileImport(userId: string, files: ImportFile[], scope: LibraryScope = "library", context = getDatabase(), declaredSource: FileSourceProviderId = "file"): SavedImport {
  const report = importPlaylistFiles(files, { demo: scope === "demo", declaredSource });
  return saveImportReport(userId, report, files, scope, context, scope === "demo" ? "demo" : declaredSource);
}

export function saveImportReport(userId: string, report: ImportReport, files: ImportFile[], scope: LibraryScope,
  context = getDatabase(), importProvider: MusicProviderId = scope === "demo" ? "demo" : "file"): SavedImport {
  const hashes = new Map(files.map((file) => [file.name, hash(file.bytes)]));
  const batchKey = hash(JSON.stringify(["v2", scope, ...(importProvider === "file" || importProvider === "demo" ? [] : [importProvider]),
    files.map((file) => [hash(file.bytes), file.name.split(".").at(-1)?.toLowerCase(), file.encoding ?? "auto"]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
  // Synchronous immediate transaction: no await may occur inside this boundary.
  return context.sqlite.transaction(() => {
    const { db } = context;
    const previous = db.select().from(s.importSessions).where(and(eq(s.importSessions.userId, userId), eq(s.importSessions.batchKey, batchKey))).get();
    if (previous?.report) return { importId: previous.id, reused: true, addedTracks: 0, addedSources: 0, report: previous.report };
    const existing = readLibrary(userId, scope, context);
    if (existing.imports.length >= 200) throw new RequestError(409, "当前库已达到 200 次导入记录上限，请先清理。", "LIBRARY_LIMIT");
    const knownSources = db.select().from(s.trackSources).where(eq(s.trackSources.userId, userId)).all();
    const knownFingerprints = new Set(knownSources.map((source) => source.sourceKey));
    const newTracks = report.tracks.map((track) => ({
      ...track,
      sources: track.sources.filter((source) => {
        const key = sourceFingerprint(source, scope, hashes.get(source.fileName ?? ""));
        return !knownFingerprints.has(key);
      }),
    })).filter((track) => track.sources.length);
    const merged = deduplicateTracks([...existing.tracks, ...newTracks], new Set(existing.tracks.map((track) => track.id))).tracks;
    if (merged.length > 5000 || merged.reduce((sum, track) => sum + track.sources.length, 0) > 20000) throw new RequestError(409, "单个库最多 5,000 首歌曲、20,000 条来源。", "LIBRARY_LIMIT");
    const sources = new Map(db.select().from(s.musicSources).where(eq(s.musicSources.userId, userId)).all().map((source) => [source.provider, source.id]));
    const ensureSource = (provider: TrackSource["provider"]) => {
      if (!sources.has(provider)) sources.set(provider, db.insert(s.musicSources).values({ userId, provider, label: provider }).returning({ id: s.musicSources.id }).get().id);
      return sources.get(provider)!;
    };
    const importId = crypto.randomUUID();
    db.insert(s.importSessions).values({ id: importId, userId, scope, batchKey, musicSourceId: ensureSource(importProvider),
      status: report.tracks.length ? "completed" : "failed", fileName: files.map((file) => file.name).join(", ").slice(0, 500), fileHash: batchKey,
      totalRecords: report.stats.totalRecords, validRecords: report.stats.validRecords, mergedRecords: report.stats.mergedRecords, errors: report.errors, report }).run();
    const artists = new Map(db.select().from(s.artists).where(eq(s.artists.userId, userId)).all().map((artist) => [artist.normalizedName, artist.id]));
    // Album keys include credited primary artist to avoid merging namesakes.
    const albums = new Map(db.select().from(s.albums).where(eq(s.albums.userId, userId)).all().map((album) => [album.normalizedName, album.id]));
    const playlists = new Map(db.select().from(s.playlists).where(eq(s.playlists.userId, userId)).all().map((playlist) => [playlist.playlistKey, playlist.id]));
    const oldSourceIds = new Set(knownSources.map((source) => source.id));
    let addedSources = 0;
    for (const track of merged) {
      let albumId: string | undefined;
      if (track.album) {
        const key = JSON.stringify([scope, matchText(track.album.name), matchText(track.artists[0].name)]);
        if (!albums.has(key)) albums.set(key, db.insert(s.albums).values({ userId, name: track.album.name, normalizedName: key, releaseDate: track.releaseDate }).returning({ id: s.albums.id }).get().id);
        albumId = albums.get(key);
      }
      db.insert(s.tracks).values({ id: track.id, userId, scope, title: track.title, canonicalKey: track.canonicalKey, versionKey: track.versionKey,
        isrc: track.isrc, durationMs: track.durationMs, genre: track.genre, releaseDate: track.releaseDate, albumId }).onConflictDoUpdate({ target: s.tracks.id,
        set: { isrc: track.isrc ?? null, durationMs: track.durationMs ?? null, genre: track.genre ?? null, releaseDate: track.releaseDate ?? null, albumId: albumId ?? null } }).run();
      for (const [position, artist] of track.artists.entries()) {
        const key = JSON.stringify([scope, matchText(artist.name)]);
        if (!artists.has(key)) artists.set(key, db.insert(s.artists).values({ userId, name: artist.name, normalizedName: key }).returning({ id: s.artists.id }).get().id);
        db.insert(s.trackArtists).values({ userId, trackId: track.id, artistId: artists.get(key)!, position }).onConflictDoNothing().run();
      }
      for (const source of track.sources) {
        if (oldSourceIds.has(source.id)) continue;
        const sourceKey = sourceFingerprint(source, scope, hashes.get(source.fileName ?? ""));
        const musicSourceId = ensureSource(source.provider);
        const inserted = db.insert(s.trackSources).values({ id: source.id, userId, trackId: track.id, musicSourceId, importSessionId: importId, sourceKey,
          importedVia: source.importedVia, externalId: source.externalId, externalUrl: source.externalUrl, fileName: source.fileName,
          rowNumber: source.row, playlistExternalId: source.playlistExternalId, playlistName: source.playlistName, rawMetadata: source.rawMetadata }).onConflictDoNothing().run();
        addedSources += inserted.changes;
        if (source.playlistExternalId) {
          const playlistKey = JSON.stringify([scope, source.provider, source.playlistExternalId]);
          if (!playlists.has(playlistKey)) playlists.set(playlistKey, db.insert(s.playlists).values({ userId, musicSourceId, externalId: source.playlistExternalId,
            playlistKey, name: source.playlistName ?? source.playlistExternalId }).returning({ id: s.playlists.id }).get().id);
          db.insert(s.playlistTracks).values({ userId, playlistId: playlists.get(playlistKey)!, trackId: track.id, position: source.row ?? 0 }).onConflictDoNothing().run();
        }
      }
      const signal = deriveTrackSignal(track);
      const values = { userId, trackId: track.id, liked: signal.liked ?? null, recentlyPlayed: signal.recentlyPlayed ?? null, playlistCount: signal.playlistCount, sourceCount: signal.sourceCount, preferenceScore: signal.preferenceScore };
      db.insert(s.userTrackSignals).values(values).onConflictDoUpdate({ target: [s.userTrackSignals.userId, s.userTrackSignals.trackId], set: values }).run();
    }
    // Report Track IDs must resolve to saved entities, including records seen earlier.
    const saved = readLibrary(userId, scope, context);
    const trackBySourceKey = new Map(db.select({ key: s.trackSources.sourceKey, trackId: s.trackSources.trackId }).from(s.trackSources).where(eq(s.trackSources.userId, userId)).all().map((source) => [source.key, source.trackId]));
    const importedIds = new Set(report.tracks.flatMap((track) => track.sources.map((source) => trackBySourceKey.get(sourceFingerprint(source, scope, hashes.get(source.fileName ?? ""))))).filter(Boolean));
    const savedReport = { ...report, tracks: saved.tracks.filter((track) => importedIds.has(track.id)) };
    db.update(s.importSessions).set({ report: savedReport }).where(eq(s.importSessions.id, importId)).run();
    return { importId, reused: false, addedTracks: merged.length - existing.tracks.length, addedSources, report: savedReport };
  }).immediate();
}

export function deleteLibrary(userId: string, context: DatabaseContext = getDatabase()) {
  return context.sqlite.transaction(() => {
    const { db } = context;
    // Ownership filters are present on every delete. User/session and bundled demo template survive.
    db.delete(s.musicWorlds).where(eq(s.musicWorlds.userId, userId)).run();
    db.delete(s.tracks).where(eq(s.tracks.userId, userId)).run();
    db.delete(s.playlists).where(eq(s.playlists.userId, userId)).run();
    db.delete(s.importSessions).where(eq(s.importSessions.userId, userId)).run();
    db.delete(s.artists).where(eq(s.artists.userId, userId)).run();
    db.delete(s.albums).where(eq(s.albums.userId, userId)).run();
    db.delete(s.musicSources).where(eq(s.musicSources.userId, userId)).run();
    return { deleted: true };
  }).immediate();
}
