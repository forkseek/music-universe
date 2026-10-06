import { relations } from "drizzle-orm";
import { sqliteTable, text, integer, real, index, unique, primaryKey, foreignKey, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type { RawTrackMetadata, MusicProviderId } from "@/types/music";
import type { GraphEvidence, WorldCluster } from "@/types/world";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const now = () => integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());

export const users = sqliteTable("users", {
  id: id(), sessionTokenHash: text("session_token_hash").notNull().unique(), createdAt: now(),
});
const owner = () => text("user_id").notNull().references(() => users.id, { onDelete: "cascade" });

export const musicSources = sqliteTable("music_sources", {
  id: id(), userId: owner(), provider: text("provider").$type<MusicProviderId>().notNull(),
  label: text("label").notNull(), createdAt: now(),
}, (t) => [unique().on(t.userId, t.id), unique().on(t.userId, t.provider)]);

export const importSessions = sqliteTable("import_sessions", {
  id: id(), userId: owner(), musicSourceId: text("music_source_id").notNull(),
  status: text("status", { enum: ["pending", "completed", "failed"] }).notNull(),
  fileName: text("file_name"), fileHash: text("file_hash"),
  batchKey: text("batch_key"), scope: text("scope", { enum: ["library", "demo"] }).notNull().default("library"),
  report: text("report", { mode: "json" }).$type<import("@/lib/music/import/types").ImportReport>(),
  totalRecords: integer("total_records").notNull().default(0),
  validRecords: integer("valid_records").notNull().default(0),
  mergedRecords: integer("merged_records").notNull().default(0),
  errors: text("errors", { mode: "json" }).$type<{ row?: number; code: string; message: string }[]>(), createdAt: now(),
}, (t) => [unique().on(t.userId, t.id), unique().on(t.userId, t.batchKey), foreignKey({ columns: [t.userId, t.musicSourceId], foreignColumns: [musicSources.userId, musicSources.id] }).onDelete("cascade")]);

export const artists = sqliteTable("artists", {
  id: id(), userId: owner(), name: text("name").notNull(), normalizedName: text("normalized_name").notNull(),
}, (t) => [unique().on(t.userId, t.id), index("artists_name_idx").on(t.userId, t.normalizedName)]);

export const albums = sqliteTable("albums", {
  id: id(), userId: owner(), name: text("name").notNull(), normalizedName: text("normalized_name").notNull(), releaseDate: text("release_date"),
}, (t) => [unique().on(t.userId, t.id), index("albums_name_idx").on(t.userId, t.normalizedName)]);

export const tracks = sqliteTable("tracks", {
  id: id(), userId: owner(), title: text("title").notNull(), canonicalKey: text("canonical_key").notNull(),
  isrc: text("isrc"), versionKey: text("version_key").notNull(), albumId: text("album_id"),
  durationMs: integer("duration_ms"), genre: text("genre", { mode: "json" }).$type<string[]>(),
  releaseDate: text("release_date"), createdAt: now(),
  scope: text("scope", { enum: ["library", "demo"] }).notNull().default("library"),
}, (t) => [unique().on(t.userId, t.id), index("tracks_canonical_idx").on(t.userId, t.canonicalKey), index("tracks_isrc_idx").on(t.userId, t.isrc),
  foreignKey({ columns: [t.userId, t.albumId], foreignColumns: [albums.userId, albums.id] }),
  check("track_duration_positive", sql`${t.durationMs} IS NULL OR ${t.durationMs} > 0`)]);

export const trackArtists = sqliteTable("track_artists", {
  userId: owner(), trackId: text("track_id").notNull(), artistId: text("artist_id").notNull(), position: integer("position").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.trackId, t.artistId] }), unique().on(t.userId, t.trackId, t.position),
  foreignKey({ columns: [t.userId, t.trackId], foreignColumns: [tracks.userId, tracks.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.userId, t.artistId], foreignColumns: [artists.userId, artists.id] }).onDelete("cascade")]);

export const trackSources = sqliteTable("track_sources", {
  id: id(), userId: owner(), trackId: text("track_id").notNull(), musicSourceId: text("music_source_id").notNull(),
  importSessionId: text("import_session_id").notNull(),
  importedVia: text("imported_via", { enum: ["file", "demo", "official"] }).notNull(),
  externalId: text("external_id"), externalUrl: text("external_url"),
  sourceKey: text("source_key").notNull(), fileName: text("file_name"), rowNumber: integer("row_number"),
  playlistExternalId: text("playlist_external_id"), playlistName: text("playlist_name"),
  rawMetadata: text("raw_metadata", { mode: "json" }).$type<RawTrackMetadata>().notNull(),
}, (t) => [unique().on(t.userId, t.sourceKey), index("track_sources_external_idx").on(t.userId, t.musicSourceId, t.externalId),
  foreignKey({ columns: [t.userId, t.trackId], foreignColumns: [tracks.userId, tracks.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.userId, t.musicSourceId], foreignColumns: [musicSources.userId, musicSources.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.userId, t.importSessionId], foreignColumns: [importSessions.userId, importSessions.id] }).onDelete("cascade")]);

export const playlists = sqliteTable("playlists", {
  id: id(), userId: owner(), musicSourceId: text("music_source_id").notNull(), externalId: text("external_id"),
  playlistKey: text("playlist_key").notNull(), name: text("name").notNull(),
}, (t) => [unique().on(t.userId, t.id), unique().on(t.userId, t.playlistKey),
  foreignKey({ columns: [t.userId, t.musicSourceId], foreignColumns: [musicSources.userId, musicSources.id] }).onDelete("cascade")]);

export const playlistTracks = sqliteTable("playlist_tracks", {
  userId: owner(), playlistId: text("playlist_id").notNull(), trackId: text("track_id").notNull(), position: integer("position").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.playlistId, t.trackId] }),
  foreignKey({ columns: [t.userId, t.playlistId], foreignColumns: [playlists.userId, playlists.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.userId, t.trackId], foreignColumns: [tracks.userId, tracks.id] }).onDelete("cascade")]);

export const userTrackSignals = sqliteTable("user_track_signals", {
  userId: owner(), trackId: text("track_id").notNull(), liked: integer("liked", { mode: "boolean" }),
  recentlyPlayed: integer("recently_played", { mode: "boolean" }), recentScore: real("recent_score"),
  playlistCount: integer("playlist_count").notNull().default(0), sourceCount: integer("source_count").notNull().default(0),
  preferenceScore: real("preference_score").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.userId, t.trackId] }), foreignKey({ columns: [t.userId, t.trackId], foreignColumns: [tracks.userId, tracks.id] }).onDelete("cascade")]);

export const musicWorlds = sqliteTable("music_worlds", {
  id: id(), userId: owner(), name: text("name").notNull(), createdAt: now(),
  scope: text("scope", { enum: ["library", "demo"] }).notNull().default("library"),
  libraryFingerprint: text("library_fingerprint").notNull().default(""),
  totalTracks: integer("total_tracks").notNull().default(0),
  hiddenTracks: integer("hidden_tracks").notNull().default(0),
  clusters: text("clusters", { mode: "json" }).$type<WorldCluster[]>().notNull().default([]),
}, (t) => [unique().on(t.userId, t.id)]);

export const musicNodes = sqliteTable("music_nodes", {
  id: id(), userId: owner(), worldId: text("world_id").notNull(),
  type: text("type", { enum: ["track", "artist", "album", "genre"] }).notNull(),
  label: text("label").notNull(), weight: real("weight").notNull(),
  trackId: text("track_id"), artistId: text("artist_id"), albumId: text("album_id"),
  metadata: text("metadata", { mode: "json" }).$type<{ trackIds: string[]; basis: string }>().notNull().default({ trackIds: [], basis: "" }),
}, (t) => [unique().on(t.userId, t.worldId, t.id),
  foreignKey({ columns: [t.userId, t.worldId], foreignColumns: [musicWorlds.userId, musicWorlds.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.userId, t.trackId], foreignColumns: [tracks.userId, tracks.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.userId, t.artistId], foreignColumns: [artists.userId, artists.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.userId, t.albumId], foreignColumns: [albums.userId, albums.id] }).onDelete("cascade")]);

export const musicEdges = sqliteTable("music_edges", {
  id: id(), userId: owner(), worldId: text("world_id").notNull(), sourceNodeId: text("source_node_id").notNull(), targetNodeId: text("target_node_id").notNull(),
  relation: text("relation", { enum: ["same_artist", "same_album", "same_genre", "similar_mood", "user_cooccurrence", "influence", "ai_related"] }).notNull(),
  weight: real("weight").notNull(), reason: text("reason"),
  evidence: text("evidence", { mode: "json" }).$type<GraphEvidence>().notNull().default({ trackIds: [], values: [] }),
}, (t) => [unique().on(t.userId, t.worldId, t.sourceNodeId, t.targetNodeId, t.relation),
  foreignKey({ columns: [t.userId, t.worldId, t.sourceNodeId], foreignColumns: [musicNodes.userId, musicNodes.worldId, musicNodes.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.userId, t.worldId, t.targetNodeId], foreignColumns: [musicNodes.userId, musicNodes.worldId, musicNodes.id] }).onDelete("cascade")]);

export const journeys = sqliteTable("journeys", {
  id: id(), userId: owner(), worldId: text("world_id").notNull(), title: text("title").notNull(), intent: text("intent").notNull(),
  mode: text("mode", { enum: ["deterministic", "ai"] }).notNull(), createdAt: now(),
}, (t) => [unique().on(t.userId, t.id), foreignKey({ columns: [t.userId, t.worldId], foreignColumns: [musicWorlds.userId, musicWorlds.id] }).onDelete("cascade")]);

export const journeyNodes = sqliteTable("journey_nodes", {
  userId: owner(), journeyId: text("journey_id").notNull(), trackId: text("track_id").notNull(), position: integer("position").notNull(), reason: text("reason").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.journeyId, t.position] }), unique().on(t.userId, t.journeyId, t.trackId),
  foreignKey({ columns: [t.userId, t.journeyId], foreignColumns: [journeys.userId, journeys.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.userId, t.trackId], foreignColumns: [tracks.userId, tracks.id] }).onDelete("cascade")]);

export const trackRelations = relations(tracks, ({ many, one }) => ({
  sources: many(trackSources), artists: many(trackArtists),
  album: one(albums, { fields: [tracks.albumId], references: [albums.id] }),
}));
export const sourceRelations = relations(trackSources, ({ one }) => ({
  track: one(tracks, { fields: [trackSources.trackId], references: [tracks.id] }),
}));
export const trackArtistRelations = relations(trackArtists, ({ one }) => ({
  track: one(tracks, { fields: [trackArtists.trackId], references: [tracks.id] }),
  artist: one(artists, { fields: [trackArtists.artistId], references: [artists.id] }),
}));
