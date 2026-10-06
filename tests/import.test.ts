import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parsePlaylistFile } from "@/lib/music/import/parse";
import { importPlaylistFiles } from "@/lib/music/import/library";
import { IMPORT_LIMITS as L } from "@/lib/music/import/limits";
import { safeSongPage } from "@/lib/music/import/validate";

const file = (name: string, text: string) => ({ name, bytes: new TextEncoder().encode(text) });
const fixture = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(`public/samples/${name}`)) });
const json = (value: unknown) => file("test.json", JSON.stringify(value));

describe("three file formats and error feedback", () => {
  it.each(["playlist.csv", "playlist.json", "playlist.txt"])("imports %s", (name) => {
    const parsed = parsePlaylistFile(fixture(name));
    expect(parsed.errors).toEqual([]);
    expect(parsed.totalRecords).toBe(3);
    expect(parsed.tracks.map((track) => track.title)).toEqual(["Let Down", "Alison", "Starless"]);
  });
  it("unifies all three formats and retains each file source", () => {
    const report = importPlaylistFiles([fixture("playlist.csv"), fixture("playlist.json"), fixture("playlist.txt")]);
    expect(report.stats).toEqual({ totalRecords: 9, validRecords: 9, invalidRecords: 0, mergedRecords: 6, uniqueTracks: 3 });
    expect(report.tracks.every((track) => track.sources.length === 3)).toBe(true);
  });
  it("labels sample preview origins and the downloadable report as demo", () => {
    const report = importPlaylistFiles([fixture("playlist.txt")], { demo: true });
    expect(report.isDemo).toBe(true);
    expect(report.tracks.every((track) => track.sources.every((source) => source.provider === "demo" && source.importedVia === "demo"))).toBe(true);
  });
  it("supports CSV commas, escaped quotes and CRLF/multiline fields", () => {
    const quoted = parsePlaylistFile(fixture("quoted.csv"));
    expect(quoted.tracks[0]).toMatchObject({ title: "A Song, Part Two", artists: ["Artist, Jr."], album: 'The "Quoted" Album' });
    const multiline = parsePlaylistFile(file("test.csv", 'title,artist\r\n"Two\r\nLines",Artist\r\n"Third, Song",Artist'));
    expect(multiline.tracks).toHaveLength(2);
    expect(multiline.tracks[0].source.row).toBe(3);
  });
  it("retains good rows and reports bad CSV rows", () => {
    const report = importPlaylistFiles([fixture("invalid-rows.csv")]);
    expect(report.stats).toEqual({ totalRecords: 3, validRecords: 1, invalidRecords: 2, mergedRecords: 0, uniqueTracks: 1 });
    expect(report.errors.map((error) => error.row)).toEqual([3, 4]);
  });
  it("rejects ambiguous TXT without guessing artist/title", () => {
    const parsed = parsePlaylistFile(fixture("ambiguous.txt"));
    expect(parsed.totalRecords).toBe(3);
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.errors.map((error) => error.row)).toEqual([2, 3]);
    expect(parsed.errors[0].code).toBe("AMBIGUOUS_TXT");
  });
  it("allows hyphens in artist and title without separator whitespace", () => {
    expect(parsePlaylistFile(file("test.txt", "Jay-Z - Re-Record")).tracks[0]).toMatchObject({ artists: ["Jay-Z"], title: "Re-Record" });
  });
  it.each(["broken.json", "broken.csv", "empty.txt"])("reports understandable errors for %s", (name) => {
    const parsed = parsePlaylistFile(fixture(name));
    expect(parsed.tracks).toHaveLength(0);
    expect(parsed.errors[0].message.length).toBeGreaterThan(8);
  });
  it.each([file("a.txt", " \r\n"), file("a.json", "[]"), file("a.csv", "title,artist\n")])("rejects empty content $name", (input) => {
    expect(parsePlaylistFile(input).errors[0].code).toBe("EMPTY_FILE");
  });
  it("rejects unknown extensions, bad roots, and duplicate CSV headers", () => {
    expect(parsePlaylistFile(file("a.mp3", "data")).errors[0].code).toBe("UNSUPPORTED_FORMAT");
    expect(parsePlaylistFile(json({ title: "Song", artist: "Artist" })).errors[0].code).toBe("INVALID_JSON_ROOT");
    expect(parsePlaylistFile(file("a.csv", "title,artist,artist\nx,y,z")).errors[0].code).toBe("INVALID_HEADER");
    expect(parsePlaylistFile(file("a.csv", "name,singer\nx,y")).errors[0].code).toBe("MISSING_COLUMNS");
  });
  it("counts malformed JSON items as invalid rows, not fatal errors", () => {
    const result = importPlaylistFiles([json([null, 2, { title: "A", artist: "B" }, { title: "X", artist: [] }])]);
    expect(result.stats).toMatchObject({ totalRecords: 4, validRecords: 1, invalidRecords: 3 });
  });
});

describe("encoding and bounded imports", () => {
  it("supports UTF-8 BOM and UTF-16 LE/BE BOM", () => {
    const content = "周杰伦 - 晴天";
    const little = Buffer.from(content, "utf16le");
    for (const bytes of [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(content)]), Buffer.concat([Buffer.from([0xff, 0xfe]), little]), Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(little).swap16()])]) {
      expect(parsePlaylistFile({ name: "a.txt", bytes }).tracks[0]?.title).toBe("晴天");
    }
  });
  it("supports explicitly selected GB18030/GBK and does not guess invalid UTF-8", () => {
    const bytes = Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4, 0x20, 0x2d, 0x20, 0xb8, 0xe8]); // 中文 - 歌
    expect(parsePlaylistFile({ name: "a.txt", bytes }).errors[0].code).toBe("INVALID_ENCODING");
    expect(parsePlaylistFile({ name: "a.txt", bytes, encoding: "gb18030" }).tracks[0]).toMatchObject({ title: "歌", artists: ["中文"] });
  });
  it("rejects BOM conflicts, invalid byte sequences, binary controls and replacement characters", () => {
    expect(parsePlaylistFile({ name: "a.txt", bytes: new Uint8Array([0xff, 0xfe, 0x41, 0]), encoding: "utf-8" }).errors[0].code).toBe("INVALID_ENCODING");
    for (const input of [file("a.txt", "a\0 - b"), file("a.txt", "a - \ufffd"), { name: "a.txt", bytes: new Uint8Array([0xc3, 0x28]) }]) expect(parsePlaylistFile(input).errors[0].code).toBe("INVALID_ENCODING");
  });
  it("enforces per-file bytes before decoding", () => {
    expect(parsePlaylistFile({ name: "a.txt", bytes: new Uint8Array(L.maxFileBytes + 1) }).errors[0].code).toBe("FILE_TOO_LARGE");
  });
  it("enforces record limits for each format", () => {
    const row = { title: "Song", artist: "Artist" };
    for (const input of [json(Array.from({ length: L.maxTracks + 1 }, () => row)), file("a.csv", "title,artist\n" + "Song,Artist\n".repeat(L.maxTracks + 1)), file("a.txt", "Artist - Song\n".repeat(L.maxTracks + 1))]) {
      const result = parsePlaylistFile(input);
      expect(result.tracks).toHaveLength(0);
      expect(result.errors[0].code).toBe("TOO_MANY_TRACKS");
    }
  });
  it("enforces batch count, batch bytes, total songs and duplicate names", () => {
    expect(importPlaylistFiles([]).errors[0].code).toBe("INVALID_BATCH");
    expect(importPlaylistFiles(Array.from({ length: 11 }, (_, i) => file(`${i}.txt`, "A - B"))).errors[0].code).toBe("INVALID_BATCH");
    expect(importPlaylistFiles(Array.from({ length: 6 }, (_, i) => ({ name: `${i}.txt`, bytes: new Uint8Array(L.maxFileBytes) }))).errors[0].code).toBe("INVALID_BATCH");
    expect(importPlaylistFiles([file("a.txt", "A - B\n".repeat(3000)), file("b.txt", "C - D\n".repeat(3000))]).errors[0].code).toBe("TOO_MANY_TRACKS");
    expect(importPlaylistFiles([fixture("playlist.csv"), fixture("playlist.csv")]).errors[0].code).toBe("DUPLICATE_FILE_NAME");
  });
  it("accepts max field length and rejects longer fields, empty names and invalid duration", () => {
    expect(parsePlaylistFile(json([{ title: "A".repeat(500), artist: "B" }])).tracks).toHaveLength(1);
    for (const row of [{ title: "A".repeat(501), artist: "B" }, { title: "A", artist: "\u200b" }, { title: "A", artist: "B", durationMs: -5 }, { title: "A", artists: Array(21).fill("B") }]) expect(parsePlaylistFile(json([row])).tracks).toHaveLength(0);
  });
});

describe("metadata whitelist and source URLs", () => {
  it("strips credentials, arbitrary metadata and audio URLs", () => {
    const result = parsePlaylistFile(json([{ title: "Song", artist: "Artist", cookie: "secret", token: "secret", metadata: { password: "secret" }, playbackUrl: "https://audio.invalid/x.mp3", externalUrl: "javascript:alert(1)" }]));
    expect(JSON.stringify(result.tracks)).not.toContain("secret");
    expect(JSON.stringify(result.tracks)).not.toContain("audio.invalid");
    expect(result.tracks[0].source.externalUrl).toBeUndefined();
    expect(result.warnings[0].code).toBe("URL_OMITTED");
  });
  it("keeps song page IDs while removing query credentials", () => {
    expect(safeSongPage("https://music.163.com/#/song?id=123&token=secret")).toBe("https://music.163.com/song?id=123");
    expect(safeSongPage("https://y.qq.com/n/ryqq/songDetail/AbC123?token=secret")).toBe("https://y.qq.com/n/ryqq/songDetail/AbC123");
    expect(safeSongPage("https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6?si=secret")).toBe("https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6");
    for (const url of ["https://evil.example/song", "http://music.163.com/song?id=123", "https://u:p@music.163.com/song?id=123", "https://music.163.com/x.mp3", "https://music.163.com.evil.example/song?id=123"]) expect(safeSongPage(url)).toBeUndefined();
    expect(safeSongPage("https://open.spotify.com/episode/6rqhFgbbKwnb9MLmUQDhG6")).toBeUndefined();
  });
  it("merges one user-supplied recording across five declared platforms without treating it as official access", () => {
    const rows = (["qqmusic", "netease", "kugou", "qishui", "spotify"] as const)
      .map((provider) => ({ title: "Shared Song", artist: "Same Artist", provider, externalId: `${provider}-song` }));
    const result = importPlaylistFiles([json(rows)]);
    expect(result.stats).toMatchObject({ validRecords: 5, mergedRecords: 4, uniqueTracks: 1 });
    expect(result.tracks[0].sources.map((source) => source.provider)).toEqual(["qqmusic", "netease", "kugou", "qishui", "spotify"]);
    expect(result.tracks[0].sources.every((source) => source.importedVia === "file")).toBe(true);
    const declared = importPlaylistFiles([json([{ title: "Another", artist: "Artist" }])], { declaredSource: "kugou" });
    expect(declared.tracks[0].sources[0].provider).toBe("kugou");
    const forbidden = parsePlaylistFile(json([{ title: "A", artist: "B", provider: "demo" }]));
    expect(forbidden.tracks).toHaveLength(0);
    expect(forbidden.errors[0].code).toBe("INVALID_PROVIDER");
  });
});
