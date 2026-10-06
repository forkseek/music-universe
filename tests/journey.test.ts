import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type DatabaseContext } from "@/db/connection";
import { createSession } from "@/lib/server/session";
import { saveFileImport, readLibrary, deleteLibrary } from "@/lib/music/library";
import { createWorld } from "@/lib/music/worlds";
import { createJourney, listJourneys, readJourney } from "@/lib/music/journeys";
import { planJourney } from "@/lib/music/journey/planner";
import { buildMusicWorld } from "@/lib/music/graph/buildGraph";
import { importPlaylistFiles } from "@/lib/music/import/library";

const folders: string[] = [];
const contexts: DatabaseContext[] = [];
function database() { const folder = mkdtempSync(path.join(tmpdir(), "music-world-journey-")); folders.push(folder); const context = openDatabase(path.join(folder, "music.db")); contexts.push(context); return context; }
const file = (name: string, content: string) => ({ name, bytes: new TextEncoder().encode(content) });
afterEach(() => {
  for (const context of contexts.splice(0)) if (context.sqlite.open) context.sqlite.close();
  for (const folder of folders.splice(0)) {
    const target = path.resolve(folder);
    if (path.dirname(target) !== path.resolve(tmpdir()) || !path.basename(target).startsWith("music-world-journey-")) throw new Error("Unsafe cleanup path");
    rmSync(target, { recursive: true, force: true });
  }
});

describe("deterministic Journey", () => {
  it("uses a real artist starting point and five distinct saved songs with sourced reasons", () => {
    const context = database(); const { userId } = createSession(context);
    const rows = Array.from({ length: 8 }, (_, index) => ({ title: `Song ${index}`, artist: index < 3 ? "A" : "B", album: index < 3 ? "Album A" : "Album B", genre: "rock",
      playlistExternalId: index < 3 ? "playlist-a" : "playlist-b", playlistName: index < 3 ? "List A" : "List B" }));
    saveFileImport(userId, [file("eight.json", JSON.stringify(rows))], "library", context);
    const world = createWorld(userId, "World", "library", context).world;
    const artist = world.nodes.find((node) => node.type === "artist" && node.label === "A")!;
    const journey = createJourney(userId, world.id, artist.id, context);
    expect(journey.nodes).toHaveLength(5);
    expect(new Set(journey.nodes.map((node) => node.trackId)).size).toBe(5);
    expect(artist.metadata.trackIds).toContain(journey.nodes[0].trackId);
    expect(journey.mode).toBe("deterministic");
    expect(journey.nodes.some((node) => /同艺术家|同专辑|同歌单|同流派/u.test(node.reason))).toBe(true);
    const routeTrackId = journey.nodes.at(-1)!.trackId;
    const resumed = createJourney(userId, world.id, routeTrackId, context, routeTrackId);
    expect(resumed.nodes).toHaveLength(5);
    expect(resumed.nodes[0].trackId).toBe(routeTrackId);
    expect(() => createJourney(userId, world.id, crypto.randomUUID(), context, crypto.randomUUID())).toThrow("不属于这个音乐库");
    expect(listJourneys(userId, world.id, context)).toHaveLength(2);
    context.sqlite.close();
    const reopened = openDatabase(context.filename); contexts.push(reopened);
    expect(readJourney(userId, journey.id, reopened)).toEqual(journey);
    const outsider = createSession(reopened);
    expect(() => readJourney(outsider.userId, journey.id, reopened)).toThrow("未找到");
    deleteLibrary(userId, reopened);
    expect(() => readJourney(userId, journey.id, reopened)).toThrow("未找到");
  });

  it("returns only actual available songs in a small library and never invents a connection", () => {
    const context = database(); const { userId } = createSession(context);
    const sample = ["playlist.csv", "playlist.json", "playlist.txt"].map((name) => ({ name, bytes: new Uint8Array(readFileSync(`public/samples/${name}`)) }));
    saveFileImport(userId, sample, "library", context);
    const world = createWorld(userId, "Three", "library", context).world;
    const journey = createJourney(userId, world.id, world.nodes[0].id, context);
    expect(journey.requestedLength).toBe(5);
    expect(journey.nodes).toHaveLength(3);
    expect(new Set(journey.nodes.map((node) => node.trackId)).size).toBe(3);
    expect(journey.nodes.slice(1).every((node) => node.reason.includes("暂无线索证明"))).toBe(true);
    expect(readLibrary(userId, "library", context).counts.tracks).toBe(3);
  });

  it("rejects a foreign node and does not treat a playlist as proof of liking", () => {
    const tracks = importPlaylistFiles([file("music.json", JSON.stringify(Array.from({ length: 5 }, (_, index) => ({ title: `T${index}`, artist: "A" }))))]).tracks;
    const world = buildMusicWorld(tracks, [], "Five", "library");
    expect(() => planJourney(world, tracks, [], "foreign-node")).toThrow();
    const stops = planJourney(world, tracks, [], world.nodes[0].id);
    expect(stops).toHaveLength(5);
    expect(stops.slice(1).every((stop) => stop.reason.includes("同艺术家"))).toBe(true);
    expect(stops.every((stop) => !/喜欢|收藏|播放/u.test(stop.reason))).toBe(true);
  });
});
