import { describe, expect, it } from "vitest";
import { parsePlaylistFile } from "@/lib/music/import/parse";
import { normalizeTrack } from "@/lib/music/normalize/track";
import { deduplicateTracks } from "@/lib/music/normalize/deduplicate";
import { deriveTrackSignal } from "@/lib/music/signals";

const normalize = (rows: unknown[]) => parsePlaylistFile({ name: "test.json", bytes: new TextEncoder().encode(JSON.stringify(rows)) }).tracks.map(normalizeTrack);
const base = { title: "Let Down", artist: "Radiohead" };
// Syntactically valid, synthetic fixture codes. Not real recording identifiers.
const isrcA = "ZZAAA2600001";
const isrcB = "ZZAAA2600002";

describe("normalization", () => {
  it("merges case, whitespace and NFKC without lowercasing display", () => {
    const input = normalize([base, { title: " Ｌｅｔ  Ｄｏｗｎ ", artist: "RADIOHEAD" }]);
    const result = deduplicateTracks(input);
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].title).toBe("Let Down");
    expect(result.tracks[0].sources[1].rawMetadata.title).toBe(" Ｌｅｔ  Ｄｏｗｎ ");
  });
  it("normalizes composed/decomposed Unicode", () => {
    expect(deduplicateTracks(normalize([{ title: "Café", artist: "Artist" }, { title: "Cafe\u0301", artist: "Artist" }])).tracks).toHaveLength(1);
  });
  it("normalizes feat./ft./featuring across artist and title", () => {
    const input = normalize([
      { title: "Song (feat. Guest)", artist: "Singer" },
      { title: "Song", artist: "Singer ft. Guest" },
      { title: "Song featuring Guest", artists: ["Singer"] },
      { title: "Song", artists: ["Singer", "Guest"] },
    ]);
    expect(deduplicateTracks(input).tracks).toHaveLength(1);
    expect(input[0].artists).toEqual([{ name: "Singer" }, { name: "Guest" }]);
  });
  it("preserves band punctuation and avoids unrequested fuzzy matching", () => {
    const rows = normalize([{ title: "Song", artist: "AC/DC" }, { title: "Song!", artist: "AC/DC" }, { title: "Song", artist: "AC DC" }]);
    expect(deduplicateTracks(rows).tracks).toHaveLength(3);
  });
  it("uses internal UUIDs and a separate platform external ID", () => {
    const [track] = normalize([{ ...base, provider: "qqmusic", externalId: "12345" }]);
    expect(track.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u);
    expect(track.sources[0].id).not.toBe(track.id);
    expect(track.sources[0].externalId).toBe("12345");
  });
  it("normalizes valid ISRC and rejects invalid ISRC", () => {
    expect(normalize([{ ...base, isrc: "zz-aaa-26-00001" }])[0].isrc).toBe(isrcA);
    expect(normalize([{ ...base, isrc: "bogus" }])).toHaveLength(0);
  });
});

describe("deduplication evidence and conflicts", () => {
  it("merges cross-provider tracks and preserves both origins", () => {
    const input = normalize([{ ...base, provider: "qqmusic", externalId: "q1" }, { ...base, provider: "netease", externalId: "n1" }]);
    const result = deduplicateTracks(input);
    expect(result.mergedRecords).toBe(1);
    expect(result.tracks[0].sources.map((source) => source.provider)).toEqual(["qqmusic", "netease"]);
    expect(input[0].sources).toHaveLength(1); // Caller-owned inputs not mutated.
  });
  it("uses ISRC for different titles but requires consistent artist evidence", () => {
    const result = deduplicateTracks(normalize([{ ...base, isrc: isrcA }, { ...base, title: "Let Down / Alternate Title", isrc: isrcA }, { ...base, artist: "Other Artist", isrc: isrcA }]));
    expect(result.tracks).toHaveLength(2);
  });
  it.each(["Live", "Remix", "Acoustic", "Remastered 2020", "Instrumental", "现场", "Club Mix"])("protects %s even with a shared ISRC", (version) => {
    expect(deduplicateTracks(normalize([{ ...base, isrc: isrcA }, { ...base, title: `Let Down (${version})`, isrc: isrcA }])).tracks).toHaveLength(2);
  });
  it("protects explicit versions, distinct remixes and unbracketed suffixes", () => {
    for (const pair of [[{ ...base, version: "Live" }, base], [{ ...base, title: "Let Down (A Remix)" }, { ...base, title: "Let Down (B Remix)" }], [base, { ...base, title: "Let Down Live" }]]) {
      expect(deduplicateTracks(normalize(pair.map((row) => ({ ...row, isrc: isrcA })))).tracks).toHaveLength(2);
    }
  });
  it("protects versions marked only in the album and distinct featured performers", () => {
    expect(deduplicateTracks(normalize([{ ...base, album: "OK Computer" }, { ...base, album: "Live at Somewhere" }])).tracks).toHaveLength(2);
    expect(deduplicateTracks(normalize([{ title: "Song", artists: ["Singer", "Guest A"], isrc: isrcA }, { title: "Song", artists: ["Singer", "Guest B"], isrc: isrcA }])).tracks).toHaveLength(2);
  });
  it("retains conflicting ISRCs and durations", () => {
    expect(deduplicateTracks(normalize([{ ...base, isrc: isrcA }, { ...base, isrc: isrcB }])).tracks).toHaveLength(2);
    expect(deduplicateTracks(normalize([{ ...base, durationMs: 100000 }, { ...base, durationMs: 130000 }])).tracks).toHaveLength(2);
    expect(deduplicateTracks(normalize([{ ...base, durationMs: 100000 }, { ...base, durationMs: 101000 }])).tracks).toHaveLength(1);
  });
  it("does not transitively bridge conflicting ISRCs through a weak row", () => {
    const rows = [base, { ...base, isrc: isrcA }, { ...base, isrc: isrcB }];
    for (const variant of [rows, [...rows].reverse(), [rows[1], rows[0], rows[2]]]) expect(deduplicateTracks(normalize(variant)).tracks).toHaveLength(3);
  });
  it("uses album evidence to disambiguate possible matches", () => {
    expect(deduplicateTracks(normalize([{ ...base, album: "A", isrc: isrcA }, { ...base, album: "B", isrc: isrcB }, { ...base, album: "A" }])).tracks).toHaveLength(2);
  });
  it("does not allow gradual duration drift to collapse different recordings", () => {
    expect(deduplicateTracks(normalize([100000, 101500, 103000].map((durationMs) => ({ ...base, durationMs })))).tracks).toHaveLength(2);
  });
  it("reimport is idempotent for tracks, origins and existing UUIDs", () => {
    const imported = normalize([{ ...base, provider: "qqmusic", externalId: "x" }, { ...base, provider: "netease", externalId: "y" }]);
    const once = deduplicateTracks(imported).tracks;
    const twice = deduplicateTracks([...once, ...imported]).tracks;
    expect(twice).toEqual(once);
  });
  it("reimport stays idempotent when weak identity remains ambiguous", () => {
    const imported = normalize([base, { ...base, isrc: isrcA }, { ...base, isrc: isrcB }]);
    const once = deduplicateTracks(imported).tracks;
    expect(deduplicateTracks([...once, ...imported]).tracks).toEqual(once);
  });
  it("retains the existing UUID when a later import adds an ISRC", () => {
    const original = normalize([base])[0];
    const richer = normalize([{ ...base, isrc: isrcA }])[0];
    const [merged] = deduplicateTracks([original, richer]).tracks;
    expect(merged.id).toBe(original.id);
    expect(merged.isrc).toBe(isrcA);
  });
});

describe("truthful music signals", () => {
  it("does not infer liking, recent plays or playlists from a plain file", () => {
    const [track] = normalize([base]);
    expect(deriveTrackSignal(track)).toMatchObject({ liked: undefined, recentlyPlayed: undefined, playlistCount: 0, sourceCount: 1, preferenceScore: 0 });
  });
  it("counts only explicit signals and distinct playlist identities", () => {
    const [track] = deduplicateTracks(normalize([
      { ...base, provider: "qqmusic", liked: true, recentlyPlayed: true, playlistExternalId: "p1" },
      { ...base, provider: "qqmusic", liked: true, recentlyPlayed: true, playlistExternalId: "p1" },
      { ...base, provider: "netease", liked: true, playlistExternalId: "p2" },
    ])).tracks;
    expect(deriveTrackSignal(track)).toMatchObject({ liked: true, recentlyPlayed: true, playlistCount: 2, sourceCount: 2, preferenceScore: 13 });
  });
  it("keeps contradictory booleans unknown and excludes demo evidence", () => {
    const [track] = deduplicateTracks(normalize([{ ...base, liked: false }, { ...base, liked: true }, { ...base, provider: "demo", recentlyPlayed: true }])).tracks;
    expect(deriveTrackSignal(track)).toMatchObject({ liked: undefined, recentlyPlayed: undefined, preferenceScore: 0 });
  });
});
