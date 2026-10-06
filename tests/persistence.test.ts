import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type DatabaseContext } from "@/db/connection";
import { createSession, findUser, tokenHash } from "@/lib/server/session";
import { saveFileImport, saveImportReport, readLibrary, deleteLibrary } from "@/lib/music/library";
import { createWorld, readWorld } from "@/lib/music/worlds";
import { getProvider } from "@/lib/music/providers/registry";
import { importProviderLibrary } from "@/lib/music/import/provider";

const contexts: DatabaseContext[] = [];
const folders: string[] = [];
function database() {
  const folder = mkdtempSync(path.join(tmpdir(), "music-world-test-")); folders.push(folder);
  const context = openDatabase(path.join(folder, "library.db")); contexts.push(context); return context;
}
const file = (name: string, content: string) => ({ name, bytes: new TextEncoder().encode(content) });
const fixture = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(`public/samples/${name}`)) });
const rows = [{ title: "Song A", artist: "Artist", album: "Album", genre: ["rock"], provider: "qqmusic", playlistExternalId: "p1", playlistName: "真实声明歌单", liked: true }, { title: "Song B", artist: "Artist", album: "Album", genre: ["rock"], provider: "qqmusic", playlistExternalId: "p1", playlistName: "真实声明歌单" }];
afterEach(() => {
  for (const context of contexts.splice(0)) if (context.sqlite.open) context.sqlite.close();
  for (const folder of folders.splice(0)) {
    const target = path.resolve(folder);
    if (path.dirname(target) !== path.resolve(tmpdir()) || !path.basename(target).startsWith("music-world-test-")) throw new Error("Unsafe test cleanup path");
    rmSync(target, { recursive: true, force: true });
  }
});

describe("SQLite library persistence", () => {
  it("initializes migrations, stores only hashed anonymous credentials and survives reopening", () => {
    const context = database();
    const session = createSession(context);
    expect(context.sqlite.prepare("SELECT session_token_hash FROM users").get()).toEqual({ session_token_hash: tokenHash(session.token) });
    saveFileImport(session.userId, [fixture("playlist.csv"), fixture("playlist.json"), fixture("playlist.txt")], "library", context);
    const library = readLibrary(session.userId, "library", context);
    expect(library.counts).toEqual({ tracks: 3, artists: 3, albums: 3, sources: 9, playlists: 0 });
    const { world } = createWorld(session.userId, "Saved", "library", context);
    context.sqlite.close();
    const reopened = openDatabase(context.filename); contexts.push(reopened);
    expect(findUser(session.token, reopened)).toBe(session.userId);
    expect(readLibrary(session.userId, "library", reopened).tracks).toEqual(library.tracks);
    expect(readWorld(session.userId, world.id, reopened)).toEqual(world);
    expect(reopened.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
  it("keeps repeat and renamed imports idempotent, including origins and sessions", () => {
    const context = database(); const { userId } = createSession(context);
    const input = [file("original.json", JSON.stringify(rows))];
    const first = saveFileImport(userId, input, "library", context);
    const second = saveFileImport(userId, [{ ...input[0], name: "renamed.json" }], "library", context);
    expect(second).toMatchObject({ importId: first.importId, reused: true, addedTracks: 0, addedSources: 0 });
    const library = readLibrary(userId, "library", context);
    expect(library.counts).toEqual({ tracks: 2, artists: 1, albums: 1, sources: 2, playlists: 1 });
    expect(library.imports).toHaveLength(1);
    expect(library.playlists[0].trackIds).toHaveLength(2);
    const likedTrack = library.tracks.find((track) => track.title === "Song A")!;
    expect(library.signals.find((s) => s.trackId === likedTrack.id)).toMatchObject({ liked: true, recentlyPlayed: undefined, preferenceScore: 5 });
    const created = createWorld(userId, "World", "library", context);
    expect(createWorld(userId, "World", "library", context)).toEqual({ world: created.world, reused: true });
  });
  it("separates a selected file source in the import key while merging the shared recording", () => {
    const context = database(); const { userId } = createSession(context);
    const input = [file("shared.json", JSON.stringify([{ title: "Shared", artist: "Artist" }]))];
    const first = saveFileImport(userId, input, "library", context, "kugou");
    const repeat = saveFileImport(userId, input, "library", context, "kugou");
    const other = saveFileImport(userId, input, "library", context, "qishui");
    expect(repeat).toMatchObject({ importId: first.importId, reused: true, addedTracks: 0, addedSources: 0 });
    expect(other).toMatchObject({ reused: false, addedTracks: 0, addedSources: 1 });
    const library = readLibrary(userId, "library", context);
    expect(library.counts).toMatchObject({ tracks: 1, sources: 2 });
    expect(library.tracks[0].sources.map((source) => source.provider).sort()).toEqual(["kugou", "qishui"]);
  });
  it("does not reuse a valid TXT import as a differently parsed CSV file", () => {
    const context = database(); const { userId } = createSession(context);
    const input = file("a.txt", "Artist - Song");
    saveFileImport(userId, [input], "library", context);
    const invalid = saveFileImport(userId, [{ ...input, name: "a.csv" }], "library", context);
    expect(invalid.reused).toBe(false);
    expect(invalid.report.errors[0].code).toBe("MISSING_COLUMNS");
  });
  it("retains tracks and origins when a previous file appears in a new batch", () => {
    const context = database(); const { userId } = createSession(context);
    saveFileImport(userId, [fixture("playlist.csv")], "library", context);
    const before = readLibrary(userId, "library", context);
    const result = saveFileImport(userId, [fixture("playlist.csv"), fixture("playlist.txt")], "library", context);
    expect(result).toMatchObject({ addedTracks: 0, addedSources: 3 });
    const after = readLibrary(userId, "library", context);
    expect(after.tracks.map((track) => track.id)).toEqual(before.tracks.map((track) => track.id));
    expect(after.counts.sources).toBe(6);
  });
  it("records invalid imports and never saves unvalidated records or secret metadata", () => {
    const context = database(); const { userId } = createSession(context);
    saveFileImport(userId, [fixture("broken.json")], "library", context);
    expect(readLibrary(userId, "library", context).imports[0].status).toBe("failed");
    expect(readLibrary(userId, "library", context).counts.tracks).toBe(0);
    saveFileImport(userId, [file("secret.json", JSON.stringify([{ title: "A", artist: "B", cookie: "test-secret-never-save", metadata: { token: "test-secret-never-save" } }]))], "library", context);
    expect(JSON.stringify(context.sqlite.prepare("SELECT raw_metadata FROM track_sources").all())).not.toContain("test-secret-never-save");
    expect(JSON.stringify(context.sqlite.prepare("SELECT report FROM import_sessions").all())).not.toContain("test-secret-never-save");
  });
  it("isolates two users and deletes only the current owner's library and derived worlds", () => {
    const context = database(); const a = createSession(context), b = createSession(context);
    saveFileImport(a.userId, [fixture("playlist.csv")], "library", context);
    saveFileImport(b.userId, [fixture("playlist.csv")], "library", context);
    const aw = createWorld(a.userId, "A", "library", context).world;
    const bw = createWorld(b.userId, "B", "library", context).world;
    expect(() => readWorld(b.userId, aw.id, context)).toThrow("未找到");
    expect(readLibrary(a.userId, "library", context).tracks[0].id).not.toBe(readLibrary(b.userId, "library", context).tracks[0].id);
    deleteLibrary(a.userId, context);
    expect(readLibrary(a.userId, "library", context).counts.tracks).toBe(0);
    expect(() => readWorld(a.userId, aw.id, context)).toThrow("未找到");
    expect(readWorld(b.userId, bw.id, context)).toEqual(bw);
    expect(readLibrary(b.userId, "library", context).counts.tracks).toBe(3);
    expect(findUser(a.token, context)).toBe(a.userId);
  });
  it("rolls back the entire import if a database write fails", () => {
    const context = database(); const { userId } = createSession(context);
    context.sqlite.exec("CREATE TRIGGER fail_import BEFORE INSERT ON track_sources BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;");
    expect(() => saveFileImport(userId, [fixture("playlist.csv")], "library", context)).toThrow();
    const library = readLibrary(userId, "library", context);
    expect(library.counts.tracks).toBe(0); expect(library.imports).toHaveLength(0);
    for (const table of ["artists", "albums", "music_sources"]) expect(context.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
  });
  it("preserves identical names with different versions and permits gradual enrichment", () => {
    const context = database(); const { userId } = createSession(context);
    saveFileImport(userId, [fixture("versions.json")], "library", context);
    expect(readLibrary(userId, "library", context).counts.tracks).toBe(4);
    saveFileImport(userId, [file("plain.txt", "Singer - Song")], "library", context);
    const id = readLibrary(userId, "library", context).tracks.find((t) => t.title === "Song")!.id;
    saveFileImport(userId, [file("richer.json", JSON.stringify([{ title: "Song", artist: "Singer", album: "Album", isrc: "ZZAAA2600001" }]))], "library", context);
    expect(readLibrary(userId, "library", context).tracks.find((t) => t.title === "Song")).toMatchObject({ id, isrc: "ZZAAA2600001" });
  });
});

describe("verified Demo and saved graph", () => {
  it("provides 60 tracks / 20 artists and keeps demo separate from real user evidence", async () => {
    const context = database(); const { userId } = createSession(context);
    const { report, file: demoFile } = await importProviderLibrary(getProvider("demo"));
    expect(report.stats.uniqueTracks).toBe(60);
    saveImportReport(userId, report, [demoFile], "demo", context);
    const library = readLibrary(userId, "demo", context);
    expect(library.counts).toEqual({ tracks: 60, artists: 20, albums: 20, playlists: 20, sources: 60 });
    expect(readLibrary(userId, "library", context).counts.tracks).toBe(0);
    expect(library.signals.every((signal) => signal.preferenceScore === 0 && signal.liked === undefined)).toBe(true);
    const { world } = createWorld(userId, "Demo", "demo", context);
    expect(world.nodes.length).toBeGreaterThanOrEqual(15); expect(world.nodes.length).toBeLessThanOrEqual(30);
    expect(world.nodes.filter((node) => node.type === "track")).toHaveLength(18);
    expect(new Set(world.nodes.map((node) => node.type))).toEqual(new Set(["track", "artist", "album", "genre"]));
    const nodeIds = new Set(world.nodes.map((node) => node.id)), trackIds = new Set(library.tracks.map((track) => track.id));
    expect(world.edges.length).toBeGreaterThan(0);
    for (const edge of world.edges) {
      expect(nodeIds.has(edge.source) && nodeIds.has(edge.target)).toBe(true);
      expect(edge.evidence.trackIds.every((id) => trackIds.has(id))).toBe(true);
      expect(edge.reason.length).toBeGreaterThan(3);
    }
    // A different user's internal UUIDs must not change which main groups are selected.
    const other = createSession(context);
    const copy = await importProviderLibrary(getProvider("demo"));
    saveImportReport(other.userId, copy.report, [copy.file], "demo", context);
    const otherWorld = createWorld(other.userId, "Demo", "demo", context).world;
    expect(otherWorld.nodes.map((node) => `${node.type}:${node.label}`).sort()).toEqual(world.nodes.map((node) => `${node.type}:${node.label}`).sort());
    expect(otherWorld.edges.map((edge) => `${edge.relation}:${edge.reason}`).sort()).toEqual(world.edges.map((edge) => `${edge.relation}:${edge.reason}`).sort());
    deleteLibrary(userId, context);
    const another = await importProviderLibrary(getProvider("demo"));
    expect(another.report.stats.uniqueTracks).toBe(60);
  });
});
